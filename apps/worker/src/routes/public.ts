import type { HtmlBedService, HtmlItem } from "@htmlbed/core";
import { HTML_CONTENT_TYPE, normalizePublicSlug } from "@htmlbed/core";
import type { AppBindings, WaitUntilContext } from "../bindings.js";
import {
  publicErrorPage,
  publicSecurityHeaders,
} from "../middleware/security-headers.js";
import { recordPublicAccess } from "../access-counter.js";
import { decoratePublicHtmlForShare } from "../public-share-meta.js";
import {
  isMarkdownContentType,
  renderPublicMarkdownDocument,
} from "../public-markdown.js";
import {
  cachePublicHtmlResponse,
  effectivePublicHtmlCacheSeconds,
  matchPublicHtmlCache,
} from "../public-cache.js";

export function publicSlugFromPath(pathname: string): string | null {
  const match = /^\/p\/([^/]+)\/?$/.exec(pathname);
  if (!match?.[1]) {
    return null;
  }
  const slug = normalizePublicSlug(match[1]);
  return slug && slug.length > 0 ? slug : null;
}

function publicHtmlHeaders(
  contentType: string,
  ttlSeconds: number,
  item: HtmlItem,
): HeadersInit {
  const headers = { ...publicSecurityHeaders };
  delete headers["Cache-Control"];
  const responseHeaders: Record<string, string> = {
    ...headers,
    "Cache-Control": `public, max-age=0, s-maxage=${ttlSeconds}`,
    "Content-Type": contentType,
  };
  responseHeaders.ETag = publicEntityTag(item);
  const lastModified = publicLastModified(item);
  if (lastModified) {
    responseHeaders["Last-Modified"] = lastModified;
  }
  return responseHeaders;
}

function publicEntityTag(item: HtmlItem): string {
  const digest = item.sha256.replace(/[^A-Za-z0-9._~-]/g, "") || item.id;
  const updatedMs = Date.parse(item.updatedAt);
  const createdMs = Date.parse(item.createdAt);
  const version = Number.isFinite(updatedMs)
    ? updatedMs
    : Number.isFinite(createdMs)
      ? createdMs
      : 0;
  return `W/"${digest}-${version}"`;
}

function publicLastModified(item: HtmlItem): string | null {
  const updatedMs = Date.parse(item.updatedAt);
  const createdMs = Date.parse(item.createdAt);
  const timestamp = Number.isFinite(updatedMs)
    ? updatedMs
    : Number.isFinite(createdMs)
      ? createdMs
      : null;
  return timestamp === null ? null : new Date(timestamp).toUTCString();
}

function stripWeakPrefix(value: string): string {
  return value.startsWith("W/") ? value.slice(2) : value;
}

function requestMatchesEtag(request: Request, etag: string): boolean {
  const value = request.headers.get("If-None-Match");
  if (!value) {
    return false;
  }
  const expected = stripWeakPrefix(etag);
  return value.split(",").some((candidate) => {
    const trimmed = candidate.trim();
    return trimmed === "*" || stripWeakPrefix(trimmed) === expected;
  });
}

function requestMatchesLastModified(
  request: Request,
  lastModified: string | null,
): boolean {
  if (!lastModified || request.headers.has("If-None-Match")) {
    return false;
  }
  const value = request.headers.get("If-Modified-Since");
  if (!value) {
    return false;
  }
  const requestTime = Date.parse(value);
  const responseTime = Date.parse(lastModified);
  return (
    Number.isFinite(requestTime) &&
    Number.isFinite(responseTime) &&
    responseTime <= requestTime
  );
}

function notModifiedResponse(
  request: Request,
  headers: Headers,
): Response | null {
  const etag = headers.get("ETag");
  const lastModified = headers.get("Last-Modified");
  if (
    (etag && requestMatchesEtag(request, etag)) ||
    requestMatchesLastModified(request, lastModified)
  ) {
    return new Response(null, { status: 304, headers });
  }
  return null;
}

export async function handlePublicRequest(
  request: Request,
  env: AppBindings,
  ctx: WaitUntilContext | undefined,
  service: HtmlBedService,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return publicErrorPage(404);
  }

  const url = new URL(request.url);
  const slug = publicSlugFromPath(url.pathname);
  if (!slug) {
    return publicErrorPage(404);
  }
  const now = new Date();

  const cached = await matchPublicHtmlCache(env, slug, request.method);
  if (cached) {
    if (cached.itemId) {
      recordPublicAccess(service, env, ctx, cached.itemId, slug);
    }
    return (
      notModifiedResponse(request, cached.response.headers) ?? cached.response
    );
  }

  const result = await service.getPublicItem(slug, now);
  if (result.kind === "not_found") {
    return publicErrorPage(404);
  }
  if (result.kind === "disabled") {
    return publicErrorPage(403);
  }
  if (result.kind === "gone") {
    return publicErrorPage(410);
  }

  recordPublicAccess(service, env, ctx, result.item.id, slug);
  const ttlSeconds = effectivePublicHtmlCacheSeconds(
    env,
    result.item.urlExpiresAt,
    result.item.fileExpiresAt,
    now,
  );
  const contentType = result.item.contentType ?? HTML_CONTENT_TYPE;
  const isMarkdown = isMarkdownContentType(contentType);
  const responseContentType = isMarkdown ? HTML_CONTENT_TYPE : contentType;
  const headers = new Headers(
    publicHtmlHeaders(responseContentType, ttlSeconds, result.item),
  );
  const conditional = notModifiedResponse(request, headers);
  if (conditional) {
    return conditional;
  }
  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers,
    });
  }

  const storedObject = await service.getPublicObject(result.item, now);
  if (!storedObject) {
    return publicErrorPage(404);
  }
  const objectContentType = storedObject.contentType ?? contentType;
  const objectIsMarkdown = isMarkdownContentType(objectContentType);
  const objectResponseContentType = objectIsMarkdown
    ? HTML_CONTENT_TYPE
    : objectContentType;
  const object = objectIsMarkdown
    ? {
        ...storedObject,
        body: await renderPublicMarkdownDocument({
          item: result.item,
          object: storedObject,
        }),
        contentType: HTML_CONTENT_TYPE,
      }
    : storedObject;
  const body = await decoratePublicHtmlForShare({
    item: result.item,
    object,
    contentType: objectResponseContentType,
    publicUrl: service.publicUrl(result.item.slug),
  });

  const response = new Response(body, {
    status: 200,
    headers,
  });
  cachePublicHtmlResponse(env, ctx, slug, result.item.id, response, ttlSeconds);
  return response;
}
