import { isAppError } from "@pagevault/core";
import { Hono } from "hono";
import type { AppBindings, AssetFetcher, HonoRuntime, ServiceFactory } from "./bindings.js";
import { apiSecurityHeaders } from "./middleware/security-headers.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { handlePublicRequest } from "./routes/public.js";
import { hostnameFromBaseUrl, isLocalDevHost, serviceFromCloudflareEnv } from "./runtime.js";

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

    if (hostname === adminHost || isLocalDevHost(hostname, env)) {
      return adminApp.fetch(request, env, ctx);
    }

    if (hostname === publicHost) {
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
