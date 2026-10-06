import { fileCapabilityForContentType } from "@pagevault/core";
import { publicDocument, publicHeader } from "../public-layout.js";
import { publicIcons } from "../public-icons.js";

export const publicSecurityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
  "Cache-Control": "private, no-store",
};

export const SVG_DOCUMENT_CONTENT_SECURITY_POLICY =
  "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'";

export function isSvgContentType(contentType: string): boolean {
  return fileCapabilityForContentType(contentType)?.securityProfile === "svg";
}

export function isPdfContentType(contentType: string): boolean {
  return fileCapabilityForContentType(contentType)?.kind === "pdf";
}

export function inlineContentHeaders(
  contentType: string,
): Record<string, string> {
  return fileCapabilityForContentType(contentType)?.delivery === "inline"
    ? { "Content-Disposition": "inline" }
    : {};
}

/** @deprecated Use inlineContentHeaders when the caller supports all file types. */
export function pdfInlineHeaders(
  contentType: string,
): Record<string, string> {
  return isPdfContentType(contentType)
    ? { "Content-Disposition": "inline" }
    : {};
}

export function publicContentHeaders(
  contentType: string,
): Record<string, string> {
  const capability = fileCapabilityForContentType(contentType);
  if (!capability) {
    return {};
  }
  const headers =
    capability.delivery === "inline"
      ? { "Content-Disposition": "inline" }
      : {};
  if (capability.securityProfile !== "svg") {
    return headers;
  }
  return {
    ...headers,
    "Content-Security-Policy": SVG_DOCUMENT_CONTENT_SECURITY_POLICY,
  };
}

/** @deprecated Use publicContentHeaders. */
export function publicSvgHeaders(
  contentType: string,
): Record<string, string> {
  return isSvgContentType(contentType)
    ? publicContentHeaders(contentType)
    : {};
}

export function adminPreviewContentHeaders(
  contentType: string,
): Record<string, string> {
  const capability = fileCapabilityForContentType(contentType);
  const headers = inlineContentHeaders(contentType);
  if (capability?.securityProfile === "binary") {
    return headers;
  }
  if (capability?.securityProfile === "svg") {
    return {
      ...headers,
      "Content-Security-Policy": `${SVG_DOCUMENT_CONTENT_SECURITY_POLICY}; frame-ancestors 'self'`,
    };
  }
  return {
    ...headers,
    "Content-Security-Policy": "sandbox allow-scripts; frame-ancestors 'self'",
  };
}

export const apiSecurityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

export function publicErrorPage(status: 403 | 404 | 410): Response {
  const messages = {
    403: {
      label: "该页面已下线",
      description: "分享者已停用此链接，暂时无法访问。",
    },
    404: {
      label: "页面不存在",
      description: "此链接不可用，请确认地址是否正确。",
    },
    410: {
      label: "链接已失效",
      description: "分享链接已超过有效期，或文件保留时间已结束。",
    },
  } as const;
  const message = messages[status];
  const html = publicDocument({
    title: `${status} · ${message.label}`,
    body: `<div class="error-shell">${publicHeader()}<main class="error-content"><div class="error-icon">${publicIcons["link-2-off"]}</div><p class="error-eyebrow">${message.label}</p><h1>此链接暂时无法打开</h1><p class="error-message">${message.description}</p><p class="error-message">请联系分享者，获取新的访问链接。</p><button class="error-back" type="button" data-go-back>${publicIcons["arrow-left"]}返回上一页</button><p class="error-code">${status} · ${message.label}</p></main><footer class="public-footer">PageVault · 文件发布与分享</footer></div>`,
  });
  return new Response(html, {
    status,
    headers: {
      ...publicSecurityHeaders,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
