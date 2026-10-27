export async function onRequestGet(context) {
  const { DAOYOU_DATA } = context.env;
  const raw = await DAOYOU_DATA.get("jobs");
  const list = raw ? JSON.parse(raw) : [];
  return new Response(JSON.stringify(list), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

export async function onRequestPost(context) {
  const { DAOYOU_DATA } = context.env;
  const body = await context.request.json();
  if (!body.title || !body.city) {
    return new Response(JSON.stringify({ error: "缺少标题或目的地" }), { status: 400 });
  }
  const raw = await DAOYOU_DATA.get("jobs");
  const list = raw ? JSON.parse(raw) : [];
  list.unshift({
    id: Date.now(),
    title: String(body.title).slice(0, 60),
    city: String(body.city).slice(0, 30),
    dateRange: String(body.dateRange || "").slice(0, 40),
    tourists: String(body.tourists || "").slice(0, 30),
    language: String(body.language || "").slice(0, 30),
    budget: String(body.budget || "").slice(0, 30),
    contact: String(body.contact || "").slice(0, 60),
    note: String(body.note || "").slice(0, 300),
    createdAt: new Date().toISOString(),
    approved: false
  });
  await DAOYOU_DATA.put("jobs", JSON.stringify(list));
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
