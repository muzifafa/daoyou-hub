export async function onRequestGet(context) {
  const { DAOYOU_DATA } = context.env;
  const raw = await DAOYOU_DATA.get("guides");
  const list = raw ? JSON.parse(raw) : [];
  return new Response(JSON.stringify(list), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

export async function onRequestPost(context) {
  const { DAOYOU_DATA } = context.env;
  const body = await context.request.json();
  if (!body.name || !body.city) {
    return new Response(JSON.stringify({ error: "缺少姓名或常驻城市" }), { status: 400 });
  }
  const raw = await DAOYOU_DATA.get("guides");
  const list = raw ? JSON.parse(raw) : [];
  list.unshift({
    id: Date.now(),
    name: String(body.name).slice(0, 30),
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
