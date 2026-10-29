import {
  endpoint,
  json,
  bodyJson,
  requireSameOrigin,
  required,
  text,
  HttpError,
} from "../../../lib/http.js";
import { db, rateLimit } from "../../../lib/storage.js";
import {
  findEmail,
  hashPassword,
  createSession,
  sessionCookie,
} from "../../../lib/auth.js";
export const onRequestPost = endpoint(async ({ request, env }) => {
  requireSameOrigin(request);
  await rateLimit(env, request, "register", 5, 3600);
  const body = await bodyJson(request);
  const email = text(body.email, 254).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const name = required(body.name, 30, "昵称");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new HttpError(400, "邮箱格式不正确");
  if (password.length < 12 || password.length > 128)
    throw new HttpError(400, "新密码需为12至128位");
  if (await findEmail(env, email))
    throw new HttpError(409, "该邮箱已注册，请直接登录");
  const uid = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
    "hex",
  );
  const hash = await hashPassword(password);
  try {
    await db(env)
      .prepare(
        "INSERT INTO users(uid,email,name,password_hash,created_at,email_verified) VALUES(?,?,?,?,?,0)",
      )
      .bind(uid, email, name, hash, new Date().toISOString())
      .run();
  } catch (error) {
    if (String(error.message).includes("UNIQUE"))
      throw new HttpError(409, "该邮箱已注册，请直接登录");
    throw error;
  }
  const sid = await createSession(env, uid, hash);
  return json({ ok: true, name, emailVerified: false }, 200, {
    "Set-Cookie": sessionCookie(sid),
  });
});
