import {
  endpoint,
  json,
  bodyJson,
  requireSameOrigin,
  HttpError,
} from "../../../lib/http.js";
import { db, getRecord, rateLimit } from "../../../lib/storage.js";
import { requireUser } from "../../../lib/auth.js";
import { endDate } from "../jobs.js";
export const onRequestPost = endpoint(async ({ request, env }) => {
  requireSameOrigin(request);
  const user = await requireUser(request, env);
  await rateLimit(env, request, "apply", 20, 3600, user.uid);
  const body = await bodyJson(request);
  const id = Number(body.id);
  if (!Number.isSafeInteger(id)) throw new HttpError(400, "编号不正确");
  const job = await getRecord(env, "jobs", id);
  if (!job) throw new HttpError(404, "需求不存在或已下架");
  if (job.ownerUid === user.uid)
    throw new HttpError(400, "无需报名自己发布的需求");
  const end = endDate(job);
  if (end && end < new Date().toISOString().slice(0, 10))
    throw new HttpError(410, "这条需求已过期");
  await db(env)
    .prepare(
      "INSERT OR IGNORE INTO applications(job_id,uid,name,created_at) VALUES(?,?,?,?)",
    )
    .bind(id, user.uid, user.name, new Date().toISOString())
    .run();
  const row = await db(env)
    .prepare("SELECT COUNT(*) AS n FROM applications WHERE job_id=?")
    .bind(id)
    .first();
  return json({ ok: true, count: row.n });
});
