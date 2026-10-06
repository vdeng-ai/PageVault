import type { PageVaultService, VaultItem } from "@pagevault/core";
import { HTML_CONTENT_TYPE, normalizePublicSlug } from "@pagevault/core";
import type { AppBindings, WaitUntilContext } from "../bindings.js";
import {
  isPdfContentType,
  publicContentHeaders,
  publicErrorPage,
  publicSecurityHeaders,
  publicShareViewerHeaders,
} from "../middleware/security-headers.js";
import { recordPublicAccess } from "../access-counter.js";
import {
  ifRangeAllowsPartial,
  parseSingleByteRange,
} from "../byte-range.js";
import { isMarkdownContentType } from "../public-markdown.js";
import { renderPublicShareViewer } from "../public-share-viewer.js";
import { publicShareArtResponse } from "../public-share-art.js";
import {
  cachePublicContentResponse,
  effectivePublicContentCacheSeconds,
  matchPublicContentCache,
  type PublicCacheVariant,
} from "../public-cache.js";

export interface PublicRoute {
  kind: PublicCacheVariant;
  slug: string;
}

export function publicRouteFromPath(pathname: string): PublicRoute | null {
  const match = /^\/(p|raw)\/([^/]+)\/?$/.exec(pathname);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  const slug = normalizePublicSlug(match[2]);
  if (!slug) {
    return null;
  }
  return {
    kind: match[1] === "raw" ? "raw" : "share",
    slug,
  };
}

export function publicSlugFromPath(pathname: string): string | null {
  const route = publicRouteFromPath(pathname);
  return route?.kind === "share" ? route.slug : null;
}

function publicResponseHeaders(
  contentType: string,
  ttlSeconds: number,
  item: VaultItem,
  variant: PublicCacheVariant,
): HeadersInit {
  const base =
    variant === "share" ? publicShareViewerHeaders : publicSecurityHeaders;
  const headers = { ...base };
  delete headers["Cache-Control"];
  const responseHeaders: Record<string, string> = {
    ...headers,
    "Cache-Control": `public, max-age=0, s-maxage=${ttlSeconds}`,
    "Content-Type": contentType,
  };
  if (variant === "raw") {
    Object.assign(responseHeaders, publicContentHeaders(contentType));
    responseHeaders["Content-Length"] = String(item.sizeBytes);
    if (isPdfContentType(contentType)) {
      responseHeaders["Accept-Ranges"] = "bytes";
    }
  }
  responseHeaders.ETag = publicEntityTag(item, variant);
  const lastModified = publicLastModified(item);
  if (lastModified) {
    responseHeaders["Last-Modified"] = lastModified;
  }
  return responseHeaders;
}

function publicEntityTag(
  item: VaultItem,
  variant: PublicCacheVariant,
): string {
  const digest = item.sha256.replace(/[^A-Za-z0-9._~-]/g, "") || item.id;
  const updatedMs = Date.parse(item.updatedAt);
  const createdMs = Date.parse(item.createdAt);
  const version = Number.isFinite(updatedMs)
    ? updatedMs
    : Number.isFinite(createdMs)
      ? createdMs
      : 0;
  return `W/"${variant}-${digest}-${version}"`;
}

function publicLastModified(item: VaultItem): string | null {
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

function publicItemUrl(
  env: AppBindings,
  variant: PublicCacheVariant,
  slug: string,
): string {
  const baseUrl = env.PUBLIC_BASE_URL.replace(/\/+$/g, "");
  const path = variant === "share" ? "p" : "raw";
  return `${baseUrl}/${path}/${encodeURIComponent(slug)}`;
}

function itemStateError(
  result: Awaited<ReturnType<PageVaultService["getPublicItem"]>>,
): Response | null {
  if (result.kind === "not_found") return publicErrorPage(404);
  if (result.kind === "disabled") return publicErrorPage(403);
  if (result.kind === "gone") return publicErrorPage(410);
  return null;
}

async function handleShareViewer(input: {
  request: Request;
  env: AppBindings;
  ctx: WaitUntilContext | undefined;
  service: PageVaultService;
  item: VaultItem;
  slug: string;
  ttlSeconds: number;
  now: Date;
}): Promise<Response> {
  const headers = new Headers(
    publicResponseHeaders(
      HTML_CONTENT_TYPE,
      input.ttlSeconds,
      input.item,
      "share",
    ),
  );
  const conditional = notModifiedResponse(input.request, headers);
  if (conditional) {
    return conditional;
  }

  if (input.request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }

  const markdown = isMarkdownContentType(input.item.contentType);
  const markdownObject = markdown
    ? await input.service.getPublicObject(input.item, input.now)
    : null;
  if (markdown && !markdownObject) {
    return publicErrorPage(404);
  }
  if (!markdown) {
    const metadata = await input.service.getObjectMetadata(input.item, input.now);
    if (!metadata) {
      return publicErrorPage(404);
    }
  }

  const body = await renderPublicShareViewer({
    item: input.item,
    publicUrl: publicItemUrl(input.env, "share", input.item.slug),
    rawUrl: publicItemUrl(input.env, "raw", input.item.slug),
    fallbackImageUrl: `${input.env.PUBLIC_BASE_URL.replace(/\/+$/g, "")}/share-card.svg`,
    ...(markdownObject ? { markdownObject } : {}),
  });
  const response = new Response(body, { status: 200, headers });
  cachePublicContentResponse(
    input.env,
    input.ctx,
    input.slug,
    input.item.id,
    response,
    input.ttlSeconds,
    "share",
  );
  return response;
}

async function handleRawContent(input: {
  request: Request;
  env: AppBindings;
  ctx: WaitUntilContext | undefined;
  service: PageVaultService;
  item: VaultItem;
  slug: string;
  ttlSeconds: number;
  now: Date;
}): Promise<Response> {
  const contentType = input.item.contentType ?? HTML_CONTENT_TYPE;
  const headers = new Headers(
    publicResponseHeaders(contentType, input.ttlSeconds, input.item, "raw"),
  );
  const conditional = notModifiedResponse(input.request, headers);
  if (conditional) {
    return conditional;
  }
  if (input.request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }

  const rangeHeader = input.request.headers.get("Range");
  if (
    rangeHeader &&
    isPdfContentType(contentType) &&
    ifRangeAllowsPartial(
      input.request.headers.get("If-Range"),
      headers.get("ETag"),
      headers.get("Last-Modified"),
    )
  ) {
    const parsed = parseSingleByteRange(rangeHeader, input.item.sizeBytes);
    if (parsed.kind === "unsatisfiable") {
      headers.set("Content-Range", `bytes */${input.item.sizeBytes}`);
      headers.set("Content-Length", "0");
      return new Response(null, { status: 416, headers });
    }

    const partial = await input.service.getObjectRange(
      input.item,
      parsed.range.start,
      parsed.range.length,
      input.now,
    );
    if (!partial) {
      return publicErrorPage(404);
    }
    if (partial.length <= 0) {
      headers.set("Content-Range", `bytes */${partial.totalSize}`);
      headers.set("Content-Length", "0");
      return new Response(null, { status: 416, headers });
    }

    headers.set(
      "Content-Range",
      `bytes ${partial.offset}-${partial.offset + partial.length - 1}/${partial.totalSize}`,
    );
    headers.set("Content-Length", String(partial.length));
    headers.set("Content-Type", partial.contentType ?? contentType);
    headers.set("Accept-Ranges", "bytes");
    return new Response(partial.body, { status: 206, headers });
  }

  const storedObject = await input.service.getPublicObject(input.item, input.now);
  if (!storedObject) {
    return publicErrorPage(404);
  }
  headers.set("Content-Type", storedObject.contentType ?? contentType);
  headers.set("Content-Length", String(storedObject.size ?? input.item.sizeBytes));

  const response = new Response(storedObject.body, {
    status: 200,
    headers,
  });
  cachePublicContentResponse(
    input.env,
    input.ctx,
    input.slug,
    input.item.id,
    response,
    input.ttlSeconds,
    "raw",
  );
  return response;
}

export async function handlePublicRequest(
  request: Request,
  env: AppBindings,
  ctx: WaitUntilContext | undefined,
  service: PageVaultService,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return publicErrorPage(404);
  }

  const url = new URL(request.url);
  if (url.pathname === "/share-card.svg") {
    return publicShareArtResponse(request.method);
  }

  const route = publicRouteFromPath(url.pathname);
  if (!route) {
    return publicErrorPage(404);
  }

  const rangeHeader =
    route.kind === "raw" && request.method === "GET"
      ? request.headers.get("Range")
      : null;
  const cached = rangeHeader
    ? null
    : await matchPublicContentCache(
        env,
        route.slug,
        request.method,
        route.kind,
      );
  if (cached) {
    if (route.kind === "share" && cached.itemId) {
      recordPublicAccess(service, env, ctx, cached.itemId, route.slug);
    }
    return (
      notModifiedResponse(request, cached.response.headers) ?? cached.response
    );
  }

  const now = new Date();
  const result = await service.getPublicItem(route.slug, now);
  const stateError = itemStateError(result);
  if (stateError) {
    return stateError;
  }
  if (result.kind !== "ok") {
    return publicErrorPage(404);
  }

  if (route.kind === "share") {
    recordPublicAccess(service, env, ctx, result.item.id, route.slug);
  }

  const ttlSeconds = effectivePublicContentCacheSeconds(
    env,
    result.item.urlExpiresAt,
    result.item.fileExpiresAt,
    now,
  );

  return route.kind === "share"
    ? handleShareViewer({
        request,
        env,
        ctx,
        service,
        item: result.item,
        slug: route.slug,
        ttlSeconds,
        now,
      })
    : handleRawContent({
        request,
        env,
        ctx,
        service,
        item: result.item,
        slug: route.slug,
        ttlSeconds,
        now,
      });
}
