import { isAppError } from "@pagevault/core";
import { Hono } from "hono";
import type { AppBindings, AssetFetcher, HonoRuntime, ServiceFactory } from "./bindings.js";
import { apiSecurityHeaders } from "./middleware/security-headers.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { handlePublicRequest } from "./routes/public.js";
import { hostnameFromBaseUrl, isLocalDevHost, serviceFromCloudflareEnv } from "./runtime.js";

function healthResponse(status: 200 | 503, body: Record<string, string>): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export interface RequestHandlerOptions {
  createService?: ServiceFactory;
  fetchAsset?: AssetFetcher;
}

function jsonError(error: unknown): Response {
  if (isAppError(error)) {
    return Response.json(
      {
        error: error.message,
        code: error.code
      },
      {
        status: error.status,
        headers: apiSecurityHeaders
      }
    );
  }

  console.error(
    JSON.stringify({
      message: "unhandled request error",
      error: error instanceof Error ? error.message : String(error)
    })
  );
  return Response.json(
    {
      error: "Internal server error"
    },
    {
      status: 500,
      headers: apiSecurityHeaders
    }
  );
}

function createAdminApp(createService: ServiceFactory, fetchAsset: AssetFetcher): Hono<HonoRuntime> {
  const app = new Hono<HonoRuntime>();

  app.use("/api/*", async (c, next) => {
    await next();
    for (const [key, value] of Object.entries(apiSecurityHeaders)) {
      c.header(key, value);
    }
  });

  registerAuthRoutes(app);
  registerAdminRoutes(app, createService);

  app.get("*", async (c) => fetchAsset(c.req.raw, c.env));
  app.onError((error) => jsonError(error));

  return app;
}

async function defaultAssetFetcher(request: Request, env: AppBindings): Promise<Response> {
  if (!env.ASSETS) {
    return new Response("Admin assets are unavailable", { status: 503 });
  }
  return env.ASSETS.fetch(request);
}

export function createRequestHandler(options: RequestHandlerOptions = {}) {
  const createService = options.createService ?? serviceFromCloudflareEnv;
  const fetchAsset = options.fetchAsset ?? defaultAssetFetcher;
  const adminApp = createAdminApp(createService, fetchAsset);

  return async function handleRequest(
    request: Request,
    env: AppBindings,
    ctx?: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname;
    const adminHost = hostnameFromBaseUrl(env.ADMIN_BASE_URL);
    const publicHost = hostnameFromBaseUrl(env.PUBLIC_BASE_URL);
    const healthHost =
      hostname === adminHost ||
      hostname === "localhost" ||
      hostname === "127.0.0.1";

    if (
      healthHost &&
      (request.method === "GET" || request.method === "HEAD") &&
      url.pathname === "/healthz"
    ) {
      const response = healthResponse(200, { status: "ok" });
      return request.method === "HEAD"
        ? new Response(null, {
            status: response.status,
            headers: response.headers,
          })
        : response;
    }

    if (
      healthHost &&
      (request.method === "GET" || request.method === "HEAD") &&
      url.pathname === "/readyz"
    ) {
      try {
        await createService(env).readinessCheck();
        const response = healthResponse(200, { status: "ready" });
        return request.method === "HEAD"
          ? new Response(null, {
              status: response.status,
              headers: response.headers,
            })
          : response;
      } catch (error) {
        console.error(
          JSON.stringify({
            message: "readiness check failed",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        const response = healthResponse(503, { status: "not_ready" });
        return request.method === "HEAD"
          ? new Response(null, {
              status: response.status,
              headers: response.headers,
            })
          : response;
      }
    }

    if (hostname === adminHost || isLocalDevHost(hostname, env)) {
      return adminApp.fetch(request, env, ctx);
    }

    if (hostname === publicHost) {
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        url.pathname === "/share-card.png"
      ) {
        const asset = await fetchAsset(request, env);
        if (!asset.ok) return asset;
        const headers = new Headers(asset.headers);
        headers.set(
          "Cache-Control",
          "public, max-age=86400, s-maxage=604800, immutable",
        );
        headers.set("X-Content-Type-Options", "nosniff");
        return new Response(request.method === "HEAD" ? null : asset.body, {
          status: asset.status,
          headers,
        });
      }
      return handlePublicRequest(request, env, ctx, createService(env));
    }

    return new Response("Not Found", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  };
}
