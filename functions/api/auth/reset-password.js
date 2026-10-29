import { endpoint, json, bodyJson, requireSameOrigin, HttpError } from "../../../lib/http.js";
import { db, rateLimit } from "../../../lib/storage.js";
import { hashPassword } from "../../../lib/auth.js";

export const onRequestPost = endpoint(async ({ request, env }) => {
  requireSameOrigin(request);
  await rateLimit(env, request, "password-reset", 10, 600);
  const body = await bodyJson(request);
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  const invalid = () => new HttpError(400, "重置链接无效或已过期，请联系站点维护者重新签发");
  if (!/^[a-f0-9]{64}$/.test(token)) throw invalid();
  if (password.length < 12 || password.length > 128)
    throw new HttpError(400, "新密码需为12至128位");
  const database = db(env);
  const digest = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))).toString("hex");
  const now = Math.floor(Date.now() / 1000);
  const active = await database.prepare("SELECT uid FROM password_resets WHERE token_hash=? AND expires_at>? AND used_at IS NULL").bind(digest, now).first();
  if (!active) throw invalid();
  const hash = await hashPassword(password);
  const claim = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex");
  const owner = "SELECT uid FROM password_resets WHERE token_hash=? AND claim_id=?";
  // Each write is gated by a fresh claim in one atomic batch. A competing or
  // already consumed token cannot update credentials or invalidate sessions.
  const result = await database.batch([
    database.prepare("UPDATE password_resets SET used_at=?,claim_id=? WHERE token_hash=? AND expires_at>? AND used_at IS NULL").bind(now, claim, digest, Math.floor(Date.now()/1000)),
    database.prepare(`UPDATE users SET password_hash=?,legacy_sessions_disabled=1 WHERE uid IN (${owner})`).bind(hash, digest, claim),
    database.prepare(`UPDATE sessions SET expires_at=0 WHERE uid IN (${owner})`).bind(digest, claim),
    database.prepare(`UPDATE password_resets SET used_at=? WHERE used_at IS NULL AND uid IN (${owner})`).bind(now, digest, claim),
    database.prepare(`INSERT INTO audit_log(actor_uid,action,target,created_at) SELECT uid,'password_reset','self',? FROM password_resets WHERE token_hash=? AND claim_id=?`).bind(new Date().toISOString(), digest, claim),
  ]);
  if (result[1].meta.changes !== 1) throw invalid();
  return json({ ok: true, message: "密码已更新，请使用新密码登录" });
});
