import { endpoint, json, requireSameOrigin } from "../../../lib/http.js";
import { db } from "../../../lib/storage.js";
import { sidFrom, sessionCookie, currentUser } from "../../../lib/auth.js";
export const onRequestPost = endpoint(async ({ request, env }) => {
  requireSameOrigin(request);
  const sid = sidFrom(request);
  if (sid) {
    await currentUser(request, env);
    await db(env)
      .prepare("UPDATE sessions SET expires_at=0 WHERE sid=?")
      .bind(sid)
      .run();
    await env.DAOYOU_DATA?.delete("session:" + sid);
  }
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
});
