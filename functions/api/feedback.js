export async function onRequestPost(context) {
  const { DAOYOU_DATA } = context.env;
  const body = await context.request.json();
  if (!body.type || !body.content) {
    return new Response(JSON.stringify({ error: "缺少反馈类型或内容" }), { status: 400 });
  }
  const raw = await DAOYOU_DATA.get("feedback");
  const list = raw ? JSON.parse(raw) : [];
  list.unshift({
    id: Date.now(),
    type: String(body.type).slice(0, 30),
    spot: String(body.spot || "").slice(0, 60),
    content: String(body.content).slice(0, 1000),
    contact: String(body.contact || "").slice(0, 60),
    createdAt: new Date().toISOString(),
    handled: false
  });
  await DAOYOU_DATA.put("feedback", JSON.stringify(list));
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
