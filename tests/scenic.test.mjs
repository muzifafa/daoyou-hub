import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
function data() {
  const p = new URL("../data/scenic.json", import.meta.url);
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  const text = fs
    .readFileSync(new URL("../map.html", import.meta.url), "utf8")
    .split("const RAW_DATA = ")[1];
  return JSON.parse(text.slice(0, text.indexOf(";\nconst NATIONAL")));
}
test("each scenic citation is an individual HTTP(S) URL", () => {
  const rows = data();
  const bad = rows.filter((r) =>
    r.sources
      ? r.sources.some(
          (s) =>
            !/^[Hh][Tt][Tt][Pp][Ss]?:\/\//.test(s.url) || /\s\|\s/.test(s.url),
        )
      : /\s\|\s/.test(r.source_url || ""),
  );
  assert.equal(bad.length, 0);
});
test("the interface distinguishes collected records from verified policies", () => {
  const text =
    fs.readFileSync(new URL("../map.html", import.meta.url), "utf8") +
    fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(/已核实\s*1827|1827\+<\/b><span>已核实/.test(text), false);
});
