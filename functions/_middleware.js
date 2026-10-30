export async function onRequest(context) {
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https://cdn.jsdelivr.net https://*.autonavi.com https://*.amap.com https://server.arcgisonline.com https://*.basemaps.cartocdn.com; connect-src 'self' https://cloudflareinsights.com; frame-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
  );
  const path = new URL(context.request.url).pathname;
  if (path === "/scenic-data.js" || path === "/sw.js")
    headers.set("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
  if (path.startsWith("/api/") || path.startsWith("/reset-password"))
    headers.set("Cache-Control", "no-store");
  if (path.startsWith("/reset-password")) {
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    headers.set("X-Frame-Options", "DENY");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
