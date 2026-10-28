export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
export function endpoint(handler) {
  return async (context) => {
    try {
      return await handler(context);
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.message }, error.status);
      console.error("API request failed", error?.name || "Error");
      return json({ error: "服务暂时不可用，请稍后重试" }, 503);
    }
  };
}
export function requireSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new HttpError(403, "请在本站提交请求");
  if (request.headers.get("Sec-Fetch-Site") === "cross-site")
    throw new HttpError(403, "请在本站提交请求");
}
export async function bodyJson(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json"))
    throw new HttpError(415, "请使用 JSON 提交");
  if (Number(request.headers.get("Content-Length")) > 8192)
    throw new HttpError(413, "提交内容过长");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 8192)
    throw new HttpError(413, "提交内容过长");
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "提交内容格式不正确");
  }
  if (!body || Array.isArray(body) || typeof body !== "object")
    throw new HttpError(400, "提交内容格式不正确");
  return body;
}
export function text(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export function required(value, max, label) {
  const v = text(value, max);
  if (!v) throw new HttpError(400, "请填写" + label);
  return v;
}
export function recordId(request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new HttpError(400, "记录编号不正确");
  return id;
}
