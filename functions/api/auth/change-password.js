import { endpoint, json, bodyJson, requireSameOrigin, HttpError } from "../../../lib/http.js";
import { db, rateLimit } from "../../../lib/storage.js";
import { requireUser, verifyPassword, hashPassword, createSession, sessionCookie } from "../../../lib/auth.js";

export const onRequestPost = endpoint(async ({ request, env }) => {
  requireSameOrigin(request);
  const user = await requireUser(request, env);
  await rateLimit(env, request, "change-password", 5, 600);
  const body = await bodyJson(request);
  const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!current || current.length > 128 || !(await verifyPassword(current, user.password_hash)))
    throw new HttpError(400, "当前密码不正确");
  if (password.length < 12 || password.length > 128)
    throw new HttpError(400, "新密码需为12至128位");
  if (password === current) throw new HttpError(400, "新密码不能与当前密码相同");
  const hash = await hashPassword(password);
  const database = db(env);
  const owner = "SELECT uid FROM users WHERE uid=? AND password_hash=?";
  // A fresh salted hash gates every later statement. A concurrent password
  // update cannot revoke the winning request's new session or recovery state.
  const result = await database.batch([
    database.prepare("UPDATE users SET password_hash=?,legacy_sessions_disabled=1 WHERE uid=? AND password_hash=?").bind(hash, user.uid, user.password_hash),
    database.prepare(`UPDATE sessions SET expires_at=0 WHERE uid IN (${owner})`).bind(user.uid, hash),
    database.prepare(`UPDATE password_resets SET used_at=? WHERE used_at IS NULL AND uid IN (${owner})`).bind(Math.floor(Date.now()/1000), user.uid, hash),
    database.prepare("INSERT INTO audit_log(actor_uid,action,target,created_at) SELECT uid,'password_change','self',? FROM users WHERE uid=? AND password_hash=?").bind(new Date().toISOString(), user.uid, hash),
  ]);
  if (result[0].meta.changes !== 1) throw new HttpError(400, "登录状态已变化，请重新登录后再试");
  const sid = await createSession(env, user.uid, hash);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(sid) });
});
