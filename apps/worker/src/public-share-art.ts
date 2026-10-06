const SHARE_CARD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="PageVault">
  <rect width="1200" height="630" fill="#09131d"/>
  <rect x="72" y="72" width="1056" height="486" rx="36" fill="#101e29" stroke="#29404e" stroke-width="2"/>
  <g transform="translate(118 132)">
    <rect width="92" height="92" rx="22" fill="#123d3b"/>
    <path d="M46 18c11 9 24 14 37 15v25c0 25-17 40-37 47-20-7-37-22-37-47V33c13-1 26-6 37-15Z" fill="none" stroke="#2dd4bf" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m31 56 11 11 22-25" fill="none" stroke="#edf7fa" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="244" y="180" fill="#edf7fa" font-family="system-ui,-apple-system,sans-serif" font-size="54" font-weight="700">PageVault</text>
  <text x="118" y="326" fill="#edf7fa" font-family="system-ui,-apple-system,sans-serif" font-size="66" font-weight="700">AI 内容，打开即看</text>
  <text x="118" y="407" fill="#91a9b6" font-family="system-ui,-apple-system,sans-serif" font-size="32">轻量 · 安全 · 为分享而生</text>
  <text x="118" y="492" fill="#2dd4bf" font-family="system-ui,-apple-system,sans-serif" font-size="26" font-weight="600">Shared with PageVault</text>
</svg>`;

export function publicShareArtResponse(method: string): Response {
  const headers = {
    "Cache-Control": "public, max-age=86400, s-maxage=604800",
    "Content-Type": "image/svg+xml; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'none'; script-src 'none'; base-uri 'none'",
  };
  return new Response(method === "HEAD" ? null : SHARE_CARD_SVG, {
    status: 200,
    headers,
  });
}
