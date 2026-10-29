import {
  endpoint,
  json,
  bodyJson,
  requireSameOrigin,
  text,
  HttpError,
} from "../../../lib/http.js";
import { db, rateLimit } from "../../../lib/storage.js";
import {
  findEmail,
  verifyPassword,
  hashPassword,
  createSession,
  sessionCookie,
} from "../../../lib/auth.js";
export const onRequestPost = endpoint(async ({ request, env }) => {
  requireSameOrigin(request);
  await rateLimit(env, request, "login", 15, 600);
  const body = await bodyJson(request);
  const email = text(body.email, 254).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password || password.length > 128)
    throw new HttpError(400, "邮箱或密码不正确");
  const user = await findEmail(env, email);
  if (!user || !(await verifyPassword(password, user.password_hash)))
    throw new HttpError(400, "邮箱或密码不正确");
  if (user.password_hash.startsWith("legacy-sha256$")) {
    const upgraded = await hashPassword(password);
    const result = await db(env)
      .prepare("UPDATE users SET password_hash=? WHERE uid=? AND password_hash=?")
      .bind(upgraded, user.uid, user.password_hash)
      .run();
    if (result.meta.changes !== 1) throw new HttpError(400, "邮箱或密码不正确");
    user.password_hash = upgraded;
  }
  const sid = await createSession(env, user.uid, user.password_hash);
  return json({ ok: true, name: user.name }, 200, {
    "Set-Cookie": sessionCookie(sid),
  });
});
