import type { Hono } from "hono";
import { randomHex } from "@pagevault/core";
import type { HonoRuntime, ServiceFactory } from "../bindings.js";
import { checkRateLimit } from "../rate-limit.js";
import {
  authenticateOAuth,
  mcpOrigin,
  oauthChallenge,
  registerOAuthRoutes,
  type McpStoreFactory,
} from "./oauth.js";

export function registerMcpRoutes(
  app: Hono<HonoRuntime>,
  createService: ServiceFactory,
  createStore: McpStoreFactory,
  fetchFile?: typeof fetch,
): void {
  registerOAuthRoutes(app, createStore);
  app.all("/mcp", async (c) => {
    const requestId = randomHex(12);
    c.set("requestId", requestId);
    c.header("X-Request-Id", requestId);
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    if (c.env.MCP_ENABLED !== "true") return c.notFound();
    const origin = c.req.header("Origin");
    if (origin && origin !== mcpOrigin(c.env))
      return c.json({ error: "Origin not allowed" }, 403);
    const token = /^Bearer\s+(\S+)$/i.exec(
      c.req.header("Authorization") ?? "",
    )?.[1];
    let principal: string | null = null;
    const service = createService(c.env);
    if (token?.startsWith("pvk_"))
      principal = (await service.authenticateApiKey(token))?.id ?? null;
    else if (token?.startsWith("pvm_a_"))
      principal = await authenticateOAuth(token, c.env, createStore(c.env));
    if (!principal) {
      const source = c.req.header("CF-Connecting-IP") ?? "unknown";
      const rate = checkRateLimit(`mcp-auth:${source}`, 60, 60_000);
      c.header("WWW-Authenticate", oauthChallenge(c.env));
      if (!rate.allowed) {
        c.header("Retry-After", String(rate.retryAfterSeconds));
        return c.json({ error: "Too many invalid MCP credentials" }, 429);
      }
      return c.json({ error: "MCP upload authorization required" }, 401);
    }
    if (c.req.method !== "POST") {
      c.header("Allow", "POST");
      return c.json({ error: "Stateless MCP accepts POST only" }, 405);
    }
    // Keep SDK initialization off the public sharing, admin, and unauthenticated paths.
    const { createUploadMcpHandler } = await import("./server.js");
    const handler = createUploadMcpHandler({
      env: c.env,
      service,
      principal,
      requestId,
      ...(fetchFile ? { fetchFile } : {}),
    });
    // The SDK returns its own Response, bypassing Hono's prepared headers.
    // Preserve streaming while explicitly attaching correlation/security headers.
    const response = await handler.fetch(c.req.raw);
    const headers = new Headers(response.headers);
    headers.set("X-Request-Id", requestId);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
  });
}
