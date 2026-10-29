import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { onRequestPost as register } from "../functions/api/auth/register.js";
import { onRequestGet as me } from "../functions/api/auth/me.js";
import { onRequestGet as adminData } from "../functions/api/admin/data.js";
import {
  onRequestPost as postGuide,
  onRequestGet as getGuides,
  onRequestDelete as deleteGuide,
} from "../functions/api/guides.js";
import {
  onRequestGet as getJobs,
  onRequestPost as postJob,
} from "../functions/api/jobs.js";
import { onRequestPost as logout } from "../functions/api/auth/logout.js";
import { onRequestPost as login } from "../functions/api/auth/login.js";

class LocalD1 {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.queryCount = 0;
    const path = new URL("../migrations/0001.sql", import.meta.url);
    if (existsSync(path)) this.db.exec(readFileSync(path, "utf8"));
    const recovery = new URL("../migrations/0002_password_recovery.sql", import.meta.url);
    if (existsSync(recovery)) this.db.exec(readFileSync(recovery, "utf8"));
  }
  prepare(sql) {
    this.queryCount++;
    const state = { params: [] };
    const db = this.db;
    return {
      bind(...params) {
        state.params = params;
        return this;
      },
      async first() {
        return db.prepare(sql).get(...state.params) || null;
      },
      async all() {
        return { results: db.prepare(sql).all(...state.params) };
      },
      async run() {
        const r = db.prepare(sql).run(...state.params);
        return { success: true, meta: { changes: Number(r.changes) } };
      },
      _sql: sql,
      _state: state,
    };
  }
  async batch(statements) {
    this.db.exec("BEGIN");
    try {
      const result = [];
      for (const s of statements) result.push(await s.run());
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
function fixture() {
  const records = new Map();
  const env = {
    DAOYOU_DB: new LocalD1(),
    ADMIN_UIDS: "trusted-owner-uid",
    DAOYOU_DATA: {
      async get(k) {
        await Promise.resolve();
        return records.get(k) ?? null;
      },
      async put(k, v) {
        records.set(k, v);
      },
      async delete(k) {
        records.delete(k);
      },
      async list({ prefix = "" } = {}) {
        return {
          keys: [...records.keys()]
            .filter((k) => k.startsWith(prefix))
            .map((name) => ({ name })),
          list_complete: true,
        };
      },
    },
  };
  return { env, records };
}
function req(
  path,
  body,
  { cookie = "", origin = "https://daoyou.chicheng.org", method = "POST" } = {},
) {
  return new Request("https://daoyou.chicheng.org" + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function context(env, request) {
  return { env, request, waitUntil() {} };
}
async function seedUser(
  f,
  uid = "ordinary-uid",
  email = "ordinary@example.test",
) {
  const salt = "local-fixture-salt";
  const hash = Buffer.from(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(salt + "LegacyPassword!"),
    ),
  ).toString("hex");
  f.records.set(
    "user:" + uid,
    JSON.stringify({
      uid,
      email,
      name: "Fixture",
      salt,
      hash,
      createdAt: new Date().toISOString(),
    }),
  );
  f.records.set("user:email:" + email, uid);
  const sid = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "hex",
  );
  f.records.set("session:" + sid, uid);
  return "daoyou_session=" + sid;
}
const guide = {
  name: "测试导游",
  licenseNo: "ABC1234D",
  city: "测试城市",
  phone: "contact@example.test",
  languages: "普通话",
};

test("self-asserted administrator email never grants an administrator role", async () => {
  const f = fixture();
  const source = readFileSync(
    new URL("../functions/api/auth/me.js", import.meta.url),
    "utf8",
  );
  const legacyEmail =
    source.match(/ADMIN_EMAILS=\['([^']+)'/)?.[1] || "reserved@example.test";
  const r = await register(
    context(
      f.env,
      req("/api/auth/register", {
        name: "Local Test",
        email: legacyEmail,
        password: "LongPassword123!",
      }),
    ),
  );
  assert.equal(r.status, 200);
  const cookie = r.headers.get("Set-Cookie").split(";")[0];
  const user = await me(
    context(f.env, req("/api/auth/me", undefined, { method: "GET", cookie })),
  );
  assert.equal((await user.json()).isAdmin, false);
});
test("existing pinned UID keeps administrator access without exposing password material", async () => {
  const f = fixture();
  const source = readFileSync(
    new URL("../functions/api/admin/data.js", import.meta.url),
    "utf8",
  );
  const email =
    source.match(/ADMIN_EMAILS=\['([^']+)'/)?.[1] || "owner@example.test";
  const cookie = await seedUser(f, "trusted-owner-uid", email);
  const r = await adminData(
    context(
      f.env,
      req("/api/admin/data", undefined, { method: "GET", cookie }),
    ),
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal("hash" in body.user, false);
  assert.equal("salt" in body.user, false);
});
test("anonymous guide creation is rejected", async () => {
  const f = fixture();
  assert.equal(
    (await postGuide(context(f.env, req("/api/guides", guide)))).status,
    401,
  );
});
test("anonymous tour request creation is rejected", async () => {
  const f = fixture();
  assert.equal(
    (
      await postJob(
        context(
          f.env,
          req("/api/jobs", { title: "测试", city: "测试", contact: "example" }),
        ),
      )
    ).status,
    401,
  );
});
test("concurrent guide submissions remain as separate records", async () => {
  const f = fixture();
  const cookie = await seedUser(f);
  const results = await Promise.all(
    ["甲", "乙"].map((name) =>
      postGuide(
        context(f.env, req("/api/guides", { ...guide, name }, { cookie })),
      ),
    ),
  );
  assert.ok(results.every((x) => x.status === 200));
  const result = await getGuides(
    context(f.env, req("/api/guides", undefined, { cookie, method: "GET" })),
  );
  assert.equal((await result.json()).list.length, 2);
});
test("cross-origin authenticated writes are rejected", async () => {
  const f = fixture();
  const cookie = await seedUser(f);
  assert.equal(
    (
      await postGuide(
        context(
          f.env,
          req("/api/guides", guide, {
            cookie,
            origin: "https://other.example",
          }),
        ),
      )
    ).status,
    403,
  );
});
test("malformed JSON returns a useful 400 response", async () => {
  const f = fixture();
  const cookie = await seedUser(f);
  const request = new Request("https://daoyou.chicheng.org/api/guides", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: "https://daoyou.chicheng.org",
      "Content-Type": "application/json",
    },
    body: "{",
  });
  assert.equal((await postGuide(context(f.env, request))).status, 400);
});
test("another account cannot delete an owned guide record", async () => {
  const f = fixture();
  const cookie = await seedUser(f);
  await postGuide(context(f.env, req("/api/guides", guide, { cookie })));
  const response = await getGuides(
    context(f.env, req("/api/guides", undefined, { method: "GET", cookie })),
  );
  const { list } = await response.json();
  const secondCookie = await seedUser(
    f,
    "different-user",
    "second@example.test",
  );
  const r = await deleteGuide(
    context(
      f.env,
      req("/api/guides?id=" + list[0].id, undefined, {
        method: "DELETE",
        cookie: secondCookie,
      }),
    ),
  );
  assert.equal(r.status, 403);
});
test("failed login gives the same message for unknown email and wrong password", async () => {
  const f = fixture();
  await seedUser(f);
  const a = await login(
    context(
      f.env,
      req("/api/auth/login", {
        email: "ordinary@example.test",
        password: "wrong",
      }),
    ),
  );
  const b = await login(
    context(
      f.env,
      req("/api/auth/login", {
        email: "unknown@example.test",
        password: "wrong",
      }),
    ),
  );
  assert.deepEqual(await a.json(), await b.json());
});

test("new passwords are stored as scrypt and can log in", async () => {
  const f = fixture();
  const body = {
    email: "new@example.test",
    password: "ThisIsALongPassword123",
    name: "New",
  };
  assert.equal(
    (await register(context(f.env, req("/api/auth/register", body)))).status,
    200,
  );
  const row = await f.env.DAOYOU_DB.prepare("SELECT * FROM users WHERE email=?")
    .bind(body.email)
    .first();
  assert.match(row.password_hash, /^scrypt\$/);
  assert.equal(
    (await login(context(f.env, req("/api/auth/login", body)))).status,
    200,
  );
});
test("legacy password login upgrades hashing without changing the account ID", async () => {
  const f = fixture();
  await seedUser(f);
  const r = await login(
    context(
      f.env,
      req("/api/auth/login", {
        email: "ordinary@example.test",
        password: "LegacyPassword!",
      }),
    ),
  );
  assert.equal(r.status, 200);
  const row = await f.env.DAOYOU_DB.prepare("SELECT * FROM users WHERE uid=?")
    .bind("ordinary-uid")
    .first();
  assert.match(row.password_hash, /^scrypt\$/);
});
test("concurrent registration with the same email creates exactly one account", async () => {
  const f = fixture();
  const body = {
    email: "same@example.test",
    password: "ThisIsALongPassword123",
    name: "New",
  };
  const results = await Promise.all([
    register(context(f.env, req("/api/auth/register", body))),
    register(context(f.env, req("/api/auth/register", body))),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});
test("logout revokes a legacy session even if its old KV entry remains cached", async () => {
  const f = fixture();
  const cookie = await seedUser(f);
  const oldDelete = f.env.DAOYOU_DATA.delete;
  f.env.DAOYOU_DATA.delete = async () => {};
  assert.equal(
    (await logout(context(f.env, req("/api/auth/logout", {}, { cookie }))))
      .status,
    200,
  );
  const result = await me(
    context(f.env, req("/api/auth/me", undefined, { method: "GET", cookie })),
  );
  assert.equal((await result.json()).loggedIn, false);
});

test("listing a busy job board stays within a bounded database query budget", async () => {
  const f = fixture();
  f.records.set(
    "jobs",
    JSON.stringify(
      Array.from({ length: 60 }, (_, i) => ({
        id: 100 + i,
        title: "Tour " + i,
        city: "Test",
        contact: "audit@example.test",
        createdAt: "2026-10-28T00:00:00Z",
      })),
    ),
  );
  await getJobs(context(f.env, req("/api/jobs", undefined, { method: "GET" })));
  f.env.DAOYOU_DB.queryCount = 0;
  const result = await getJobs(
    context(f.env, req("/api/jobs", undefined, { method: "GET" })),
  );
  assert.equal(result.status, 200);
  assert.equal((await result.json()).list.length, 60);
  assert.ok(
    f.env.DAOYOU_DB.queryCount <= 12,
    "a public list must not issue one database query per job",
  );
});

async function recoveryFixture(expires = Math.floor(Date.now()/1000)+900) {
  assert.ok(existsSync(new URL("../migrations/0002_password_recovery.sql",import.meta.url)),"password recovery persistence is not implemented");
  const f=fixture(); const cookie=await seedUser(f,"trusted-owner-uid","owner@example.test");
  await me(context(f.env,req("/api/auth/me",undefined,{method:"GET",cookie})));
  const token="a".repeat(64);
  const hash=Buffer.from(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))).toString("hex");
  f.env.DAOYOU_DB.db.prepare("INSERT INTO password_resets(token_hash,uid,expires_at) VALUES(?,?,?)").run(hash,"trusted-owner-uid",expires);
  const {onRequestPost:reset}=await import("../functions/api/auth/reset-password.js");
  return {...f,cookie,token,reset};
}
test("password recovery requires a valid token and never accepts an email as authorization",async()=>{
  const f=await recoveryFixture();
  const r=await f.reset(context(f.env,req("/api/auth/reset-password",{email:"owner@example.test",password:"NewPassword123!"})));
  assert.equal(r.status,400);
});
test("expired recovery links cannot change a password",async()=>{
  const f=await recoveryFixture(1);
  const r=await f.reset(context(f.env,req("/api/auth/reset-password",{token:f.token,password:"NewPassword123!"})));
  assert.equal(r.status,400);
  const old=await login(context(f.env,req("/api/auth/login",{email:"owner@example.test",password:"LegacyPassword!"})));
  assert.equal(old.status,200);
});
test("recovery consumes the token, preserves the account role and revokes D1 and uncached legacy sessions",async()=>{
  const f=await recoveryFixture();
  const legacySid="b".repeat(64);f.records.set("session:"+legacySid,"trusted-owner-uid");
  const r=await f.reset(context(f.env,req("/api/auth/reset-password",{token:f.token,password:"NewPassword123!"})));
  assert.equal(r.status,200);assert.equal(r.headers.get("Set-Cookie"),null);
  const again=await f.reset(context(f.env,req("/api/auth/reset-password",{token:f.token,password:"OtherPassword123!"})));
  assert.equal(again.status,400);
  for(const cookie of [f.cookie,"daoyou_session="+legacySid]){
    const current=await me(context(f.env,req("/api/auth/me",undefined,{method:"GET",cookie})));
    assert.equal((await current.json()).loggedIn,false);
  }
  const old=await login(context(f.env,req("/api/auth/login",{email:"owner@example.test",password:"LegacyPassword!"})));
  assert.equal(old.status,400);
  const fresh=await login(context(f.env,req("/api/auth/login",{email:"owner@example.test",password:"NewPassword123!"})));
  assert.equal(fresh.status,200);
  const current=await me(context(f.env,req("/api/auth/me",undefined,{method:"GET",cookie:fresh.headers.get("Set-Cookie").split(";")[0]})));
  assert.equal((await current.json()).isAdmin,true);
});
test("invalid password and cross-origin attempts leave a recovery token usable",async()=>{
  const f=await recoveryFixture();
  let r=await f.reset(context(f.env,req("/api/auth/reset-password",{token:f.token,password:"short"})));
  assert.equal(r.status,400);
  r=await f.reset(context(f.env,req("/api/auth/reset-password",{token:f.token,password:"NewPassword123!"},{origin:"https://other.example"})));
  assert.equal(r.status,403);
  r=await f.reset(context(f.env,req("/api/auth/reset-password",{token:f.token,password:"NewPassword123!"})));
  assert.equal(r.status,200);
});

test("a database failure rolls back token consumption and the password update",async()=>{
  const f=await recoveryFixture();
  f.env.DAOYOU_DB.db.exec("CREATE TRIGGER fail_reset_audit BEFORE INSERT ON audit_log WHEN NEW.action='password_reset' BEGIN SELECT RAISE(ABORT,'fixture'); END;");
  const response=await f.reset(context(f.env,req("/api/auth/reset-password",{token:f.token,password:"NewPassword123!"})));
  assert.equal(response.status,503);
  assert.equal(f.env.DAOYOU_DB.db.prepare("SELECT used_at FROM password_resets").get().used_at,null);
  const old=await login(context(f.env,req("/api/auth/login",{email:"owner@example.test",password:"LegacyPassword!"})));
  assert.equal(old.status,200);
});
test("reset pages disable caching, referrers, external scripts and embedding",async()=>{
  const {onRequest:middleware}=await import("../functions/_middleware.js");
  const response=await middleware({request:new Request("https://daoyou.chicheng.org/reset-password"),next:async()=>new Response("reset form")});
  assert.equal(response.headers.get("Cache-Control"),"no-store");
  assert.equal(response.headers.get("Referrer-Policy"),"no-referrer");
  assert.equal(response.headers.get("X-Frame-Options"),"DENY");
  assert.ok(response.headers.get("Content-Security-Policy").includes("script-src 'self';"));
});

test("a login verified before recovery cannot create a session after the reset",async()=>{
  const f=await recoveryFixture();
  const staleHash=f.env.DAOYOU_DB.db.prepare("SELECT password_hash FROM users WHERE uid=?").get("trusted-owner-uid").password_hash;
  const response=await f.reset(context(f.env,req("/api/auth/reset-password",{token:f.token,password:"NewPassword123!"})));
  assert.equal(response.status,200);
  const {createSession}=await import("../lib/auth.js");
  await assert.rejects(()=>createSession(f.env,"trusted-owner-uid",staleHash),error=>error.status===400);
});

async function changeHandler() {
  assert.ok(existsSync(new URL('../functions/api/auth/change-password.js',import.meta.url)), 'authenticated password change is not implemented');
  return (await import('../functions/api/auth/change-password.js')).onRequestPost;
}
test('password change requires an authenticated session',async()=>{
  const change=await changeHandler();const f=fixture();
  const response=await change(context(f.env,req('/api/auth/change-password',{currentPassword:'LegacyPassword!',password:'ChangedPassword123!'})));
  assert.equal(response.status,401);
});
test('wrong current password and invalid new password preserve the current session',async()=>{
  const change=await changeHandler();const f=await recoveryFixture();
  for(const body of [{currentPassword:'WrongPassword!',password:'ChangedPassword123!'},{currentPassword:'LegacyPassword!',password:'short'},{currentPassword:'LegacyPassword!',password:'LegacyPassword!'}]){
    assert.equal((await change(context(f.env,req('/api/auth/change-password',body,{cookie:f.cookie})))).status,400);
  }
  const current=await me(context(f.env,req('/api/auth/me',undefined,{method:'GET',cookie:f.cookie})));
  assert.equal((await current.json()).loggedIn,true);
});
test('authenticated password change rotates the session, revokes recovery and preserves the role',async()=>{
  const change=await changeHandler();const f=await recoveryFixture();
  const response=await change(context(f.env,req('/api/auth/change-password',{currentPassword:'LegacyPassword!',password:'ChangedPassword123!'},{cookie:f.cookie})));
  assert.equal(response.status,200);
  const cookie=response.headers.get('Set-Cookie').split(';')[0];assert.notEqual(cookie,f.cookie);
  const old=await me(context(f.env,req('/api/auth/me',undefined,{method:'GET',cookie:f.cookie})));
  assert.equal((await old.json()).loggedIn,false);
  const fresh=await me(context(f.env,req('/api/auth/me',undefined,{method:'GET',cookie})));
  const user=await fresh.json();assert.equal(user.loggedIn,true);assert.equal(user.isAdmin,true);
  assert.equal((await f.reset(context(f.env,req('/api/auth/reset-password',{token:f.token,password:'OtherPassword123!'})))).status,400);
  assert.equal((await login(context(f.env,req('/api/auth/login',{email:'owner@example.test',password:'LegacyPassword!'})))).status,400);
  assert.equal((await login(context(f.env,req('/api/auth/login',{email:'owner@example.test',password:'ChangedPassword123!'})))).status,200);
});
test('cross-origin authenticated password change is rejected without changing credentials',async()=>{
  const change=await changeHandler();const f=await recoveryFixture();
  const response=await change(context(f.env,req('/api/auth/change-password',{currentPassword:'LegacyPassword!',password:'ChangedPassword123!'},{cookie:f.cookie,origin:'https://other.example'})));
  assert.equal(response.status,403);
  assert.equal((await login(context(f.env,req('/api/auth/login',{email:'owner@example.test',password:'LegacyPassword!'})))).status,200);
});
