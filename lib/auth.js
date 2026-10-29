import { scrypt, timingSafeEqual } from "node:crypto";
import { db } from "./storage.js";
import { HttpError } from "./http.js";
export const COOKIE_NAME = "daoyou_session";
export function sessionCookie(sid, maxAge = 2592000) {
  return `${COOKIE_NAME}=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export function sidFrom(request) {
  return (
    (request.headers.get("Cookie") || "").match(
      /(?:^|;\s*)daoyou_session=([a-f0-9]{64})(?:;|$)/,
    )?.[1] || null
  );
}
export function isAdmin(user, env) {
  return (
    !!user &&
    (env.ADMIN_UIDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .includes(user.uid)
  );
}
export function safeUser(user, env) {
  return {
    uid: user.uid,
    name: user.name,
    email: user.email,
    isAdmin: isAdmin(user, env),
    emailVerified: !!user.email_verified,
  };
}
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return `scrypt$16384$8$5$${Buffer.from(salt).toString("hex")}$${hash.toString("hex")}`;
}
function derive(password, salt) {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      32,
      { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 },
      (err, value) => (err ? reject(err) : resolve(value)),
    ),
  );
}
export async function verifyPassword(password, stored) {
  if (stored.startsWith("scrypt$")) {
    const parts = stored.split("$");
    if (
      parts.length !== 6 ||
      parts[1] !== "16384" ||
      parts[2] !== "8" ||
      parts[3] !== "5"
    )
      return false;
    const actual = await derive(password, Buffer.from(parts[4], "hex"));
    const expected = Buffer.from(parts[5], "hex");
    return (
      expected.length === actual.length && timingSafeEqual(actual, expected)
    );
  }
  if (stored.startsWith("legacy-sha256$")) {
    const [, salt, hash] = stored.split("$");
    const value = Buffer.from(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(salt + password),
      ),
    ).toString("hex");
    return value === hash;
  }
  return false;
}
export async function findUser(env, uid) {
  let user = await db(env)
    .prepare("SELECT * FROM users WHERE uid=?")
    .bind(uid)
    .first();
  if (user) return user;
  const raw = await env.DAOYOU_DATA?.get("user:" + uid);
  if (!raw) return null;
  let old;
  try {
    old = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!old.email || !old.uid) return null;
  await db(env)
    .prepare(
      "INSERT OR IGNORE INTO users(uid,email,name,password_hash,created_at,email_verified) VALUES(?,?,?,?,?,?)",
    )
    .bind(
      old.uid,
      old.email.toLowerCase(),
      old.name || "导游",
      `legacy-sha256$${old.salt}$${old.hash}`,
      old.createdAt || new Date().toISOString(),
      0,
    )
    .run();
  return await db(env)
    .prepare("SELECT * FROM users WHERE uid=?")
    .bind(uid)
    .first();
}
export async function findEmail(env, email) {
  let user = await db(env)
    .prepare("SELECT * FROM users WHERE email=?")
    .bind(email)
    .first();
  if (user) return user;
  const uid = await env.DAOYOU_DATA?.get("user:email:" + email);
  return uid ? await findUser(env, uid) : null;
}
export async function currentUser(request, env) {
  const sid = sidFrom(request);
  if (!sid) return null;
  const now = Math.floor(Date.now() / 1000);
  let session = await db(env)
    .prepare("SELECT uid,expires_at FROM sessions WHERE sid=?")
    .bind(sid)
    .first();
  if (!session) {
    const uid = await env.DAOYOU_DATA?.get("session:" + sid);
    if (!uid) return null;
    const user = await findUser(env, uid);
    if (!user || user.legacy_sessions_disabled) return null;
    await db(env)
      .prepare(
        "INSERT OR IGNORE INTO sessions(sid,uid,expires_at) VALUES(?,?,?)",
      )
      .bind(sid, uid, now + 86400 * 7)
      .run();
    session = { uid, expires_at: now + 86400 * 7 };
  }
  if (session.expires_at <= now) return null;
  return findUser(env, session.uid);
}
export async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, "请先登录后再提交");
  return user;
}
export async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (!isAdmin(user, env)) throw new HttpError(403, "无管理权限");
  return user;
}
export async function createSession(env, uid, expectedPasswordHash) {
  const sid = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "hex",
  );
  const result = await db(env)
    .prepare("INSERT INTO sessions(sid,uid,expires_at) SELECT ?,uid,? FROM users WHERE uid=? AND password_hash=?")
    .bind(sid, Math.floor(Date.now() / 1000) + 2592000, uid, expectedPasswordHash)
    .run();
  if (result.meta.changes !== 1) throw new HttpError(400, "邮箱或密码不正确");
  return sid;
}
