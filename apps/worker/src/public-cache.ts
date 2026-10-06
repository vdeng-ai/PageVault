import type { AppBindings, WaitUntilContext } from "./bindings.js";

const DEFAULT_PUBLIC_CONTENT_CACHE_SECONDS = 3600;
const PUBLIC_CONTENT_CACHE_VERSION = "3";
export type PublicCacheVariant = "share" | "raw";
const CACHE_ITEM_ID_HEADER = "X-PageVault-Cache-Item-Id";

export interface CachedPublicContent {
  itemId: string | null;
  response: Response;
}

export function publicContentCacheSeconds(env: AppBindings): number {
  const parsed = Number.parseInt(env.PUBLIC_HTML_CACHE_SECONDS ?? "", 10);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return DEFAULT_PUBLIC_CONTENT_CACHE_SECONDS;
}

export function effectivePublicContentCacheSeconds(
  env: AppBindings,
  urlExpiresAt: string,
  fileExpiresAt: string,
  now = new Date(),
): number {
  const configuredSeconds = publicContentCacheSeconds(env);
  if (configuredSeconds <= 0) {
    return 0;
  }

  const nowMs = now.getTime();
  const expirySeconds = [urlExpiresAt, fileExpiresAt].map((value) =>
    Math.floor((Date.parse(value) - nowMs) / 1000),
  );
  if (
    expirySeconds.some((seconds) => !Number.isFinite(seconds) || seconds <= 0)
  ) {
    return 0;
  }
  return Math.min(configuredSeconds, ...expirySeconds);
}

function defaultCache(): Cache | null {
  if (typeof caches === "undefined") {
    return null;
  }
  return (caches as CacheStorage & { default: Cache }).default;
}

function publicContentCacheRequest(
  env: AppBindings,
  slug: string,
  variant: PublicCacheVariant,
): Request {
  const baseUrl = env.PUBLIC_BASE_URL.replace(/\/+$/g, "");
  const path = variant === "share" ? "p" : "raw";
  return new Request(
    `${baseUrl}/${path}/${encodeURIComponent(slug)}?pv-cache=${PUBLIC_CONTENT_CACHE_VERSION}`,
    {
      method: "GET",
    },
  );
}

function logCacheFailure(error: unknown, action: string, slug: string): void {
  console.error(
    JSON.stringify({
      message: "public content cache failed",
      action,
      slug,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}

function scheduleCacheWork(
  promise: Promise<void>,
  ctx: WaitUntilContext | undefined,
): void {
  if (ctx) {
    ctx.waitUntil(promise);
  } else {
    void promise;
  }
}

export async function matchPublicContentCache(
  env: AppBindings,
  slug: string,
  method: string,
  variant: PublicCacheVariant = "share",
): Promise<CachedPublicContent | null> {
  if (publicContentCacheSeconds(env) <= 0) {
    return null;
  }
  const cache = defaultCache();
  if (!cache) {
    return null;
  }

  const cached = await cache.match(publicContentCacheRequest(env, slug, variant));
  if (!cached || cached.status !== 200) {
    return null;
  }

  const headers = new Headers(cached.headers);
  const itemId = headers.get(CACHE_ITEM_ID_HEADER);
  headers.delete(CACHE_ITEM_ID_HEADER);
  return {
    itemId,
    response: new Response(method === "HEAD" ? null : cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers,
    }),
  };
}

export function cachePublicContentResponse(
  env: AppBindings,
  ctx: WaitUntilContext | undefined,
  slug: string,
  itemId: string,
  response: Response,
  ttlSeconds = publicContentCacheSeconds(env),
  variant: PublicCacheVariant = "share",
): void {
  if (ttlSeconds <= 0 || response.status !== 200) {
    return;
  }
  const cache = defaultCache();
  if (!cache) {
    return;
  }

  const headers = new Headers(response.headers);
  headers.set(CACHE_ITEM_ID_HEADER, itemId);
  const cacheResponse = new Response(response.clone().body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  scheduleCacheWork(
    cache
      .put(publicContentCacheRequest(env, slug, variant), cacheResponse)
      .catch((error: unknown) => {
        logCacheFailure(error, "put", slug);
      }),
    ctx,
  );
}

export async function deletePublicContentCache(
  env: AppBindings,
  slug: string,
): Promise<void> {
  const cache = defaultCache();
  if (!cache) {
    return;
  }
  await Promise.all([
    cache.delete(publicContentCacheRequest(env, slug, "share")),
    cache.delete(publicContentCacheRequest(env, slug, "raw")),
  ]);
}

export function purgePublicContentCache(
  env: AppBindings,
  ctx: WaitUntilContext | undefined,
  slug: string,
): void {
  scheduleCacheWork(
    deletePublicContentCache(env, slug).catch((error: unknown) => {
      logCacheFailure(error, "delete", slug);
    }),
    ctx,
  );
}


/** @deprecated Use CachedPublicContent. */
export type CachedPublicHtml = CachedPublicContent;
/** @deprecated Use publicContentCacheSeconds. */
export const publicHtmlCacheSeconds = publicContentCacheSeconds;
/** @deprecated Use effectivePublicContentCacheSeconds. */
export const effectivePublicHtmlCacheSeconds = effectivePublicContentCacheSeconds;
/** @deprecated Use matchPublicContentCache. */
export const matchPublicHtmlCache = matchPublicContentCache;
/** @deprecated Use cachePublicContentResponse. */
export const cachePublicHtmlResponse = cachePublicContentResponse;
/** @deprecated Use deletePublicContentCache. */
export const deletePublicHtmlCache = deletePublicContentCache;
/** @deprecated Use purgePublicContentCache. */
export const purgePublicHtmlCache = purgePublicContentCache;
