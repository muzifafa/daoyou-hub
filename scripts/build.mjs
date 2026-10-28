import { mkdir, copyFile, writeFile, rm, readFile } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const name of [
  "index.html",
  "404.html",
  "map.html",
  "guides.html",
  "jobs.html",
  "feedback.html",
  "privacy.html",
  "sw.js",
  "manifest.json",
  "robots.txt",
  "sitemap.xml",
  "_headers",
  "_redirects",
  "share.svg",
]) {
  try {
    await copyFile(name, "dist/" + name);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
const rows = JSON.parse(await readFile("data/scenic.json", "utf8"));
await writeFile(
  "dist/scenic-data.js",
  "const RAW_DATA = " + JSON.stringify(rows).replaceAll("<", "\\u003c") + ";\n",
);
