import {
  endpoint,
  json,
  requireSameOrigin,
  recordId,
  HttpError,
} from "../../../lib/http.js";
import { db, getRecord } from "../../../lib/storage.js";
import { requireAdmin } from "../../../lib/auth.js";
export const onRequestPost = endpoint(async ({ request, env }) => {
  requireSameOrigin(request);
  const user = await requireAdmin(request, env);
  const id = recordId(request);
  const record = await getRecord(env, "feedback", id);
  if (!record) throw new HttpError(404, "反馈不存在");
  await db(env).batch([
    db(env)
      .prepare(
        "UPDATE records SET payload=json_set(payload,'$.handled',json('true')) WHERE kind='feedback' AND id=?",
      )
      .bind(id),
    db(env)
      .prepare(
        "INSERT INTO audit_log(actor_uid,action,target,created_at) VALUES(?,?,?,?)",
      )
      .bind(user.uid, "handle", "feedback:" + id, new Date().toISOString()),
  ]);
  return json({ ok: true });
});
