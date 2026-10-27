export async function onRequestGet(context) {
  const { DAOYOU_DATA } = context.env;
  const raw = await DAOYOU_DATA.get("guides");
  const list = raw ? JSON.parse(raw) : [];
  const safe = list.map(g => ({
    id: g.id,
    name: g.name ? g.name[0] + "**" : "",
    licenseNo: g.licenseNo ? g.licenseNo.slice(0, 2) + "****" + g.licenseNo.slice(-2) : "",
    city: g.city,
    languages: g.languages,
    specialty: g.specialty,
    phone: g.phone,
    note: g.note,
    createdAt: g.createdAt
  }));
  return new Response(JSON.stringify(safe), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

export async function onRequestPost(context) {
  const { DAOYOU_DATA } = context.env;
  const body = await context.request.json();
  if (!body.name || !body.city || !body.licenseNo) {
    return new Response(JSON.stringify({ error: "缺少姓名、常驻城市或导游证号" }), { status: 400 });
  }
  const licenseNo = String(body.licenseNo).trim().toUpperCase();
  if (!/^[A-Z]{3}\d{4}[A-Z]$/.test(licenseNo)) {
    return new Response(JSON.stringify({ error: "导游证号格式不正确，应为3个大写字母+4个数字+1个大写字母（如 BJS1234A）" }), { status: 400 });
  }
  const raw = await DAOYOU_DATA.get("guides");
  const list = raw ? JSON.parse(raw) : [];
  list.unshift({
    id: Date.now(),
    name: String(body.name).slice(0, 30),
    licenseNo: licenseNo.slice(0, 30),
    city: String(body.city).slice(0, 20),
    languages: String(body.languages || "").slice(0, 60),
    specialty: String(body.specialty || "").slice(0, 100),
    phone: String(body.phone || "").slice(0, 30),
    note: String(body.note || "").slice(0, 200),
    createdAt: new Date().toISOString(),
    approved: false
  });
  await DAOYOU_DATA.put("guides", JSON.stringify(list));
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
