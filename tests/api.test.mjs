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
