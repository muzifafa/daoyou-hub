// Operator-only recovery. Requires existing Cloudflare account authorization;
// never expose this operation as an email-only public endpoint.
import { execFileSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile, access } from "node:fs/promises";
import { resolve, relative, isAbsolute, sep } from "node:path";

const [emailInput, outputInput] = process.argv.slice(2);
const email = (emailInput || "").trim().toLowerCase();
const output = outputInput && resolve(outputInput);
const account = process.env.CLOUDFLARE_ACCOUNT_ID || "";
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !output || !/^[a-f0-9]{32}$/.test(account)) {
  console.error("Usage: CLOUDFLARE_ACCOUNT_ID=... node scripts/issue-password-reset.mjs EMAIL PRIVATE_OUTPUT_JSON");
  process.exit(1);
}
try {
  const destination = relative(process.cwd(), output);
  if (!destination.startsWith(".." + sep) && !isAbsolute(destination)) throw new Error("Private output must be outside the source repository.");
  let exists = false;
  try { await access(output); exists = true; } catch {}
  if (exists) throw new Error("Output file already exists; use a new private filename.");
  const config = await readFile("wrangler.toml", "utf8");
  const database = config.match(/database_id\s*=\s*"([a-f0-9-]+)"/)?.[1];
  if (!database) throw new Error("Production database is not configured.");
  const auth = JSON.parse(execFileSync("npx", ["--yes", "wrangler", "auth", "token", "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  const query = async (sql, params) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
      method: "POST", headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (WebsiteOwnerMaintenance)" },
      body: JSON.stringify({ sql, params }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error("Cloudflare database request failed.");
    return data.result[0];
  };
  const rows = (await query("SELECT uid FROM users WHERE email=?", [email])).results;
  if (rows.length !== 1) throw new Error("No unique existing account was found.");
  const uid = rows[0].uid;
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = Math.floor(Date.now()/1000);
  const expiry = now + 900;
  await query("UPDATE password_resets SET used_at=? WHERE uid=? AND used_at IS NULL", [now, uid]);
  await query("INSERT INTO password_resets(token_hash,uid,expires_at) VALUES(?,?,?)", [tokenHash, uid, expiry]);
  await query("INSERT INTO audit_log(actor_uid,action,target,created_at) VALUES(?,?,?,?)", ["cloudflare-maintainer", "issue_password_reset", uid, new Date().toISOString()]);
  await writeFile(output, JSON.stringify({ url: `https://daoyou.chicheng.org/reset-password#token=${token}`, expiresAt: new Date(expiry*1000).toISOString() }), { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ privateFile: output, expiresAt: new Date(expiry*1000).toISOString(), tokenPrinted: false }));
} catch (error) {
  // Do not print subprocess buffers, credentials or API response bodies.
  console.error("Recovery issuance failed; check operator access, account, private output path and database migration.");
  process.exit(1);
}
