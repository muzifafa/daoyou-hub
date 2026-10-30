import { createHash } from "node:crypto";
import { mkdir, copyFile, writeFile, rm, readFile, cp } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const name of [
  "index.html",
  "404.html",
  "map.html",
  "map.js",
  "map-filters.js",
  "guides.html",
  "jobs.html",
  "feedback.html",
  "privacy.html",
  "reset-password.html",
  "reset-password.js",
  "account.js",
  "sw.js",
  "manifest.json",
  "robots.txt",
  "sitemap.xml",
  "_headers",
  "_redirects",
  "share.svg",
  "share.png",
]) {
  try {
    await copyFile(name, "dist/" + name);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
const rows = JSON.parse(await readFile("data/scenic.json", "utf8"));
await cp("vendor", "dist/vendor", { recursive: true });
await writeFile(
  "dist/scenic-data.js",
  "const SCENIC_META = " + JSON.stringify({version:createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0,12),generatedAt:new Date().toISOString()}) + ";\nconst RAW_DATA = " + JSON.stringify(rows).replaceAll("<", "\\u003c") + ";\n",
);
