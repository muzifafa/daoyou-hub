import {
  endpoint,
  json,
  requireSameOrigin,
  recordId,
  HttpError,
} from "../../../lib/http.js";
import { db, importLegacyRecords, audit } from "../../../lib/storage.js";
import { requireAdmin } from "../../../lib/auth.js";
export const onRequestDelete = endpoint(async ({ request, env }) => {
  requireSameOrigin(request);
  const user = await requireAdmin(request, env);
  const kind = new URL(request.url).searchParams.get("kind");
  if (!["guides", "jobs", "feedback"].includes(kind))
    throw new HttpError(400, "无效类型");
  const id = recordId(request);
  await importLegacyRecords(env);
  await db(env).batch([
    db(env).prepare("DELETE FROM records WHERE kind=? AND id=?").bind(kind, id),
    db(env)
      .prepare(
        "INSERT INTO audit_log(actor_uid,action,target,created_at) VALUES(?,?,?,?)",
      )
      .bind(user.uid, "delete", kind + ":" + id, new Date().toISOString()),
  ]);
  return json({ ok: true });
});
