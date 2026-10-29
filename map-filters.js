export function parseFilters(search, rows) {
  const params = new URLSearchParams(search);
  const province = params.get("province") || "全部";
  const category = params.get("category") || "全部";
  return {
    province: rows.some(row => row.province === province) ? province : "全部",
    category: ["全部", "持证免票", "本身免费", "带团免票", "不免", "待核实"].includes(category) ? category : "全部",
    query: (params.get("q") || "").trim().slice(0, 120),
    verifiedOnly: params.get("verified") === "1",
  };
}
export function filterRows(rows, state) {
  const query = state.query.trim().toLowerCase();
  return rows.filter(row => {
    if (state.province !== "全部" && row.province !== state.province) return false;
    if (state.verifiedOnly && row.verification !== "已查证") return false;
    if (state.category === "带团免票") {
      if (row.condition_type !== "带团免票") return false;
    } else if (state.category !== "全部" && row.category !== state.category) return false;
    return !query || [row.name, row.province, row.city].join(" ").toLowerCase().includes(query);
  });
}
export function filterURL(base, state) {
  const url = new URL(base);
  url.search = "";url.hash = "";
  if (state.province !== "全部") url.searchParams.set("province", state.province);
  if (state.category !== "全部") url.searchParams.set("category", state.category);
  if (state.query.trim()) url.searchParams.set("q", state.query.trim().slice(0, 120));
  if (state.verifiedOnly) url.searchParams.set("verified", "1");
  return url.href;
}
