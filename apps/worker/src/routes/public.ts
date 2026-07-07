import type { HtmlBedService } from "@htmlbed/core";
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
): HeadersInit {
  const headers = { ...publicSecurityHeaders };
  delete headers["Cache-Control"];
  return {
    ...headers,
    "Cache-Control": `public, max-age=0, s-maxage=${ttlSeconds}`,
    "Content-Type": contentType,
  };
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
    return cached.response;
  }

  const result = await service.getPublicHtml(slug, now);
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
  const contentType = result.object.contentType ?? HTML_CONTENT_TYPE;
  const isMarkdown = isMarkdownContentType(contentType);
  const responseContentType = isMarkdown ? HTML_CONTENT_TYPE : contentType;
  const object = isMarkdown
    ? {
        ...result.object,
        body:
          request.method === "HEAD"
            ? new ArrayBuffer(0)
            : await renderPublicMarkdownDocument({
                item: result.item,
                object: result.object,
              }),
        contentType: HTML_CONTENT_TYPE,
      }
    : result.object;
  const body =
    request.method === "HEAD"
      ? null
      : await decoratePublicHtmlForShare({
          item: result.item,
          object,
          contentType: responseContentType,
          publicUrl: service.publicUrl(result.item.slug),
        });

  const response = new Response(body, {
    status: 200,
    headers: publicHtmlHeaders(responseContentType, ttlSeconds),
  });
  if (request.method === "GET") {
    cachePublicHtmlResponse(
      env,
      ctx,
      slug,
      result.item.id,
      response,
      ttlSeconds,
    );
  }
  return response;
}
