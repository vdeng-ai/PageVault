export const publicSecurityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
  "Cache-Control": "private, no-store"
};

export const apiSecurityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store"
};

export function publicErrorPage(status: 403 | 404 | 410): Response {
  const messages = {
    403: "该页面已下线",
    404: "页面不存在",
    410: "该页面链接已过期"
  } as const;
  return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${messages[status]}</title></head><body>${messages[status]}</body></html>`, {
    status,
    headers: {
      ...publicSecurityHeaders,
      "Content-Type": "text/html; charset=utf-8"
    }
  });
}
