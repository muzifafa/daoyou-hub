import { HttpError } from "./http.js";
export function db(env) {
  if (!env.DAOYOU_DB) throw new HttpError(503, "数据服务正在维护，请稍后再试");
  return env.DAOYOU_DB;
}
export async function importLegacyRecords(env) {
  const database = db(env);
  if (
    await database
      .prepare("SELECT value FROM metadata WHERE key=?")
      .bind("legacy-records-v1")
      .first()
  )
    return;
  const statements = [];
  for (const kind of ["guides", "jobs", "feedback"]) {
    const raw = await env.DAOYOU_DATA?.get(kind);
    let rows = [];
    try {
      rows = raw ? JSON.parse(raw) : [];
    } catch {
      throw new HttpError(503, "历史数据需要检查，请联系维护者");
    }
    if (!Array.isArray(rows)) throw new HttpError(503, "历史数据格式不正确");
    for (const item of rows) {
      if (!Number.isSafeInteger(Number(item.id))) continue;
      statements.push(
        database
          .prepare(
            "INSERT OR IGNORE INTO records(kind,id,owner_uid,payload,created_at) VALUES(?,?,?,?,?)",
          )
          .bind(
            kind,
            Number(item.id),
            item.ownerUid || null,
            JSON.stringify(item),
            item.createdAt || new Date().toISOString(),
          ),
      );
      if (kind === "jobs")
        for (const a of item.applicants || []) {
          const uid = typeof a === "object" ? a.uid : a;
          if (uid)
            statements.push(
              database
                .prepare(
                  "INSERT OR IGNORE INTO applications(job_id,uid,name,created_at) VALUES(?,?,?,?)",
                )
                .bind(
                  Number(item.id),
                  uid,
                  typeof a === "object" ? a.name || "导游" : "导游",
                  new Date().toISOString(),
                ),
            );
        }
    }
  }
  // Batched migration is idempotent. The completion marker is written only after all rows exist.
  for (let i = 0; i < statements.length; i += 50)
    await database.batch(statements.slice(i, i + 50));
  await database
    .prepare("INSERT OR IGNORE INTO metadata(key,value) VALUES(?,?)")
    .bind("legacy-records-v1", new Date().toISOString())
    .run();
}
export async function listRecords(env, kind) {
  await importLegacyRecords(env);
  const r = await db(env)
    .prepare(
      "SELECT id,owner_uid,payload,created_at FROM records WHERE kind=? ORDER BY created_at DESC,id DESC LIMIT 500",
    )
    .bind(kind)
    .all();
  return r.results.map((r) => ({
    ...JSON.parse(r.payload),
    id: r.id,
    ownerUid: r.owner_uid,
    createdAt: r.created_at,
  }));
}
export async function getRecord(env, kind, id) {
  await importLegacyRecords(env);
  const r = await db(env)
    .prepare(
      "SELECT id,owner_uid,payload,created_at FROM records WHERE kind=? AND id=?",
    )
    .bind(kind, id)
    .first();
  return r
    ? {
        ...JSON.parse(r.payload),
        id: r.id,
        ownerUid: r.owner_uid,
        createdAt: r.created_at,
      }
    : null;
}
export async function createRecord(env, kind, payload, ownerUid) {
  await importLegacyRecords(env);
  for (let attempt = 0; attempt < 3; attempt++) {
    const id =
      Date.now() * 1000 +
      (crypto.getRandomValues(new Uint16Array(1))[0] % 1000);
    const createdAt = new Date().toISOString();
    try {
      await db(env)
        .prepare(
          "INSERT INTO records(kind,id,owner_uid,payload,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(kind, id, ownerUid || null, JSON.stringify(payload), createdAt)
        .run();
      return id;
    } catch (error) {
      if (!String(error.message).includes("UNIQUE")) throw error;
    }
  }
  throw new HttpError(503, "提交繁忙，请重试");
}
export async function deleteOwned(env, kind, id, uid) {
  const item = await getRecord(env, kind, id);
  if (!item || item.ownerUid !== uid)
    throw new HttpError(403, "找不到记录或这不是你提交的内容");
  await db(env)
    .prepare("DELETE FROM records WHERE kind=? AND id=? AND owner_uid=?")
    .bind(kind, id, uid)
    .run();
}
export async function audit(env, uid, action, target) {
  await db(env)
    .prepare(
      "INSERT INTO audit_log(actor_uid,action,target,created_at) VALUES(?,?,?,?)",
    )
    .bind(uid, action, target, new Date().toISOString())
    .run();
}
export async function rateLimit(
  env,
  request,
  action,
  limit = 20,
  windowSeconds = 600,
  identity = "",
) {
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / windowSeconds);
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(action + ":" + ip + ":" + identity),
  );
  const key = Buffer.from(bytes).toString("hex") + ":" + bucket;
  const row = await db(env)
    .prepare(
      "INSERT INTO rate_limits(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits",
    )
    .bind(key, (bucket + 1) * windowSeconds)
    .first();
  if (now % 20 === 0)
    await db(env)
      .prepare("DELETE FROM rate_limits WHERE expires_at < ?")
      .bind(now - windowSeconds)
      .run();
  if (row.hits > limit) throw new HttpError(429, "操作太频繁，请稍后再试");
}
