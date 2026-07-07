import type { AppBindings, WaitUntilContext } from "./bindings.js";

const DEFAULT_PUBLIC_HTML_CACHE_SECONDS = 3600;
const CACHE_ITEM_ID_HEADER = "X-HTMLBed-Cache-Item-Id";

export interface CachedPublicHtml {
  itemId: string | null;
  response: Response;
}

export function publicHtmlCacheSeconds(env: AppBindings): number {
  const parsed = Number.parseInt(env.PUBLIC_HTML_CACHE_SECONDS ?? "", 10);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return DEFAULT_PUBLIC_HTML_CACHE_SECONDS;
}

export function effectivePublicHtmlCacheSeconds(
  env: AppBindings,
  urlExpiresAt: string,
  fileExpiresAt: string,
  now = new Date(),
): number {
  const configuredSeconds = publicHtmlCacheSeconds(env);
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

function publicHtmlCacheRequest(env: AppBindings, slug: string): Request {
  const baseUrl = env.PUBLIC_BASE_URL.replace(/\/+$/g, "");
  return new Request(`${baseUrl}/p/${encodeURIComponent(slug)}`, {
    method: "GET",
  });
}

function logCacheFailure(error: unknown, action: string, slug: string): void {
  console.error(
    JSON.stringify({
      message: "public html cache failed",
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

export async function matchPublicHtmlCache(
  env: AppBindings,
  slug: string,
  method: string,
): Promise<CachedPublicHtml | null> {
  if (publicHtmlCacheSeconds(env) <= 0) {
    return null;
  }
  const cache = defaultCache();
  if (!cache) {
    return null;
  }

  const cached = await cache.match(publicHtmlCacheRequest(env, slug));
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

export function cachePublicHtmlResponse(
  env: AppBindings,
  ctx: WaitUntilContext | undefined,
  slug: string,
  itemId: string,
  response: Response,
  ttlSeconds = publicHtmlCacheSeconds(env),
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
      .put(publicHtmlCacheRequest(env, slug), cacheResponse)
      .catch((error: unknown) => {
        logCacheFailure(error, "put", slug);
      }),
    ctx,
  );
}

export async function deletePublicHtmlCache(
  env: AppBindings,
  slug: string,
): Promise<void> {
  const cache = defaultCache();
  if (!cache) {
    return;
  }
  await cache.delete(publicHtmlCacheRequest(env, slug));
}

export function purgePublicHtmlCache(
  env: AppBindings,
  ctx: WaitUntilContext | undefined,
  slug: string,
): void {
  scheduleCacheWork(
    deletePublicHtmlCache(env, slug).catch((error: unknown) => {
      logCacheFailure(error, "delete", slug);
    }),
    ctx,
  );
}
