import {
  AppError,
  fixedTimeEqual,
  parseCookie,
  randomHex,
  SESSION_COOKIE_NAME,
  sha256Hex,
  verifyCsrfToken,
  verifySession,
} from "@pagevault/core";
import type { Context, Hono } from "hono";
import type { AppBindings, HonoRuntime } from "../bindings.js";
import { requireAdmin, requireAdminWrite } from "../middleware/admin-auth.js";
import { checkRateLimit } from "../rate-limit.js";
import { readBoundedBytes } from "./files.js";
import type { McpGrant, McpStore, McpToken } from "./store.js";

export const MCP_SCOPE = "assets:upload";
const ACCESS_SECONDS = 3600;
const GRANT_MS = 30 * 24 * 60 * 60 * 1000;
export type McpStoreFactory = (env: AppBindings) => McpStore;

export function mcpOrigin(env: AppBindings): string {
  return new URL(env.ADMIN_BASE_URL).origin;
}
export function mcpResource(env: AppBindings): string {
  return `${mcpOrigin(env)}/mcp`;
}
export function oauthConfigured(env: AppBindings): boolean {
  return Boolean(
    env.MCP_OAUTH_CLIENT_ID?.trim() && env.MCP_OAUTH_REDIRECT_URIS?.trim(),
  );
}

export function oauthChallenge(env: AppBindings): string {
  return `Bearer resource_metadata="${mcpOrigin(env)}/.well-known/oauth-protected-resource/mcp", scope="${MCP_SCOPE}"`;
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function validToken(
  token: McpToken | null,
  env: AppBindings,
  now: number,
): token is McpToken {
  return Boolean(
    token &&
    token.revoked_at === null &&
    token.expires_at > now &&
    token.token_expires_at > now &&
    token.client_id === env.MCP_OAUTH_CLIENT_ID &&
    token.resource === mcpResource(env) &&
    token.scope === MCP_SCOPE,
  );
}

export async function authenticateOAuth(
  token: string,
  env: AppBindings,
  store: McpStore,
  now = Date.now(),
): Promise<string | null> {
  if (!/^pvm_a_[a-f0-9]{64}$/.test(token) || !oauthConfigured(env)) return null;
  const record = await store.getToken(await sha256Hex(token));
  return validToken(record, env, now) && record.kind === "access"
    ? `mcp:${record.id}`
    : null;
}

async function form(c: Context<HonoRuntime>): Promise<URLSearchParams> {
  if (
    c.req.header("Content-Type")?.split(";")[0]?.trim() !==
    "application/x-www-form-urlencoded"
  ) {
    throw new AppError(
      "Expected application/x-www-form-urlencoded",
      415,
      "invalid_request",
    );
  }
  const bytes = await readBoundedBytes(c.req.raw, 16 * 1024);
  const values = new URLSearchParams(new TextDecoder().decode(bytes));
  for (const key of values.keys()) {
    if (values.getAll(key).length !== 1)
      throw new AppError("Duplicate OAuth parameter", 400, "invalid_request");
  }
  return values;
}

function authorizationRequest(values: URLSearchParams, env: AppBindings) {
  const clientId = values.get("client_id");
  const redirectUri = values.get("redirect_uri") ?? "";
  const allowed = (env.MCP_OAUTH_REDIRECT_URIS ?? "")
    .split(",")
    .map((s) => s.trim());
  let uri: URL;
  try {
    uri = new URL(redirectUri);
  } catch {
    throw new AppError("Invalid redirect URI", 400, "invalid_request");
  }
  if (
    clientId !== env.MCP_OAUTH_CLIENT_ID ||
    !allowed.includes(redirectUri) ||
    uri.protocol !== "https:" ||
    uri.username ||
    uri.password ||
    uri.hash
  ) {
    // Never redirect an error to an unvalidated client URL.
    throw new AppError(
      "Unregistered OAuth client or redirect URI",
      400,
      "invalid_request",
    );
  }
  const state = values.get("state") ?? "";
  const challenge = values.get("code_challenge") ?? "";
  if (
    values.get("response_type") !== "code" ||
    values.get("scope") !== MCP_SCOPE ||
    values.get("resource") !== mcpResource(env) ||
    values.get("code_challenge_method") !== "S256" ||
    !/^[A-Za-z0-9_-]{43}$/.test(challenge) ||
    !state ||
    state.length > 1024
  ) {
    throw new AppError(
      "Use code + PKCE S256, assets:upload, state, and the exact MCP resource",
      400,
      "invalid_request",
    );
  }
  return { clientId, redirectUri, state, challenge };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (s) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        s
      ]!,
  );
}

function redirectResponse(
  env: AppBindings,
  redirectUri: string,
  state: string,
  value: { code: string } | { error: string },
): Response {
  const url = new URL(redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("iss", mcpOrigin(env));
  for (const [key, val] of Object.entries(value))
    url.searchParams.set(key, val);
  return new Response(null, {
    status: 303,
    headers: {
      Location: url.href,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

async function authenticateClient(
  c: Context<HonoRuntime>,
  values: URLSearchParams,
): Promise<boolean> {
  let clientId = values.get("client_id") ?? "";
  let secret = values.get("client_secret") ?? "";
  const authorization = c.req.header("Authorization");
  if (authorization) {
    if (!authorization.startsWith("Basic ") || values.has("client_secret"))
      return false;
    try {
      const decoded = atob(authorization.slice(6));
      const colon = decoded.indexOf(":");
      if (colon < 0) return false;
      const basicId = decodeURIComponent(
        decoded.slice(0, colon).replace(/\+/g, " "),
      );
      if (clientId && clientId !== basicId) return false;
      clientId = basicId;
      secret = decodeURIComponent(decoded.slice(colon + 1).replace(/\+/g, " "));
    } catch {
      return false;
    }
  }
  if (clientId !== c.env.MCP_OAUTH_CLIENT_ID) return false;
  return c.env.MCP_OAUTH_CLIENT_SECRET
    ? fixedTimeEqual(secret, c.env.MCP_OAUTH_CLIENT_SECRET)
    : !authorization && !secret;
}

async function issueTokens(store: McpStore, grant: McpGrant, now: number) {
  const access = `pvm_a_${randomHex(32)}`;
  const refresh = `pvm_r_${randomHex(32)}`;
  const accessExpiry = Math.min(grant.expires_at, now + ACCESS_SECONDS * 1000);
  await store.issue([
    {
      hash: await sha256Hex(access),
      grantId: grant.id,
      kind: "access",
      expiresAt: accessExpiry,
    },
    {
      hash: await sha256Hex(refresh),
      grantId: grant.id,
      kind: "refresh",
      expiresAt: grant.expires_at,
    },
  ]);
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: Math.floor((accessExpiry - now) / 1000),
    refresh_token: refresh,
    scope: MCP_SCOPE,
  };
}

export function registerOAuthRoutes(
  app: Hono<HonoRuntime>,
  createStore: McpStoreFactory,
): void {
  // Metadata is public; consent and token issuance are not. No wildcard CORS on credentials.
  app.use("/oauth/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Content-Type-Options", "nosniff");
    if (c.env.MCP_ENABLED !== "true" || !oauthConfigured(c.env))
      return c.notFound();
    if (c.req.method === "POST" && c.req.path !== "/oauth/authorize") {
      const rate = checkRateLimit(
        `oauth-token:${c.req.header("CF-Connecting-IP") ?? "unknown"}`,
        60,
        60_000,
      );
      if (!rate.allowed) {
        c.header("Retry-After", String(rate.retryAfterSeconds));
        return c.json({ error: "slow_down" }, 429);
      }
    }
    return next();
  });

  app.get("/.well-known/oauth-authorization-server", (c) => {
    if (c.env.MCP_ENABLED !== "true" || !oauthConfigured(c.env))
      return c.notFound();
    const origin = mcpOrigin(c.env);
    c.header("Cache-Control", "no-store");
    return c.json({
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      revocation_endpoint: `${origin}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: [MCP_SCOPE],
      token_endpoint_auth_methods_supported: c.env.MCP_OAUTH_CLIENT_SECRET
        ? ["client_secret_post", "client_secret_basic"]
        : ["none"],
      authorization_response_iss_parameter_supported: true,
    });
  });
  app.get("/.well-known/oauth-protected-resource", resourceMetadata);
  app.get("/.well-known/oauth-protected-resource/mcp", resourceMetadata);

  app.get("/oauth/authorize", async (c) => {
    const values = new URL(c.req.url).searchParams;
    for (const key of values.keys()) {
      if (values.getAll(key).length !== 1)
        throw new AppError("Duplicate OAuth parameter", 400, "invalid_request");
    }
    const input = authorizationRequest(values, c.env);
    const session = await verifySession(
      parseCookie(c.req.header("Cookie") ?? null, SESSION_COOKIE_NAME),
      c.env.SESSION_SECRET,
    );
    if (!session || session.email !== c.env.ADMIN_EMAIL) {
      return c.redirect(
        `/?oauthReturnTo=${encodeURIComponent(`/oauth/authorize?${values.toString()}`)}`,
        303,
      );
    }
    const fields = [...values.entries()].filter(([key]) =>
      [
        "client_id",
        "redirect_uri",
        "response_type",
        "scope",
        "resource",
        "state",
        "code_challenge",
        "code_challenge_method",
      ].includes(key),
    );
    fields.push(["csrf", session.csrfToken]);
    // no-referrer turns a browser form POST's Origin into "null". Keep the
    // consent form same-origin; the external OAuth redirect remains no-referrer.
    c.header("Referrer-Policy", "same-origin");
    c.header(
      "Content-Security-Policy",
      // Browsers apply form-action to the 303 redirect too. This origin comes
      // only from the exact, already validated callback allowlist.
      `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(input.redirectUri).origin}; frame-ancestors 'none'; base-uri 'none'`,
    );
    return c.html(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>授权 PageVault 上传</title>
      <style>body{font:16px/1.7 system-ui;margin:0;background:#f5f6fa;color:#171923}main{max-width:32rem;margin:10vh auto;padding:2rem;background:white;border-radius:20px}h1{font-size:1.5rem}code{overflow-wrap:anywhere}button{padding:.8rem 1.2rem;margin:.5rem .5rem 0 0;cursor:pointer;border-radius:8px;border:1px solid #aaa}button[value=allow]{background:#171923;color:white}</style>
      <main><h1>允许通过聊天上传到 PageVault？</h1>
      <p>客户端：<code>${escapeHtml(input.clientId)}</code><br>当前账户：${escapeHtml(session.email)}</p>
      <p>仅允许上传文件和查询上传规则。不能读取私有文件、列出资产或删除文件。上传默认私有；明确选择公开时，持有链接的人可访问。</p>
      <p>授权最长 30 天，可随时在后台的 API Keys 页面撤销。文件保留期限由每次上传设置决定。</p>
      <form method="post" action="/oauth/authorize">${fields.map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`).join("")}
      <button name="decision" value="allow">允许上传</button><button name="decision" value="deny">取消</button></form></main></html>`);
  });

  app.post("/oauth/authorize", async (c) => {
    const values = await form(c);
    const input = authorizationRequest(values, c.env);
    const session = await verifySession(
      parseCookie(c.req.header("Cookie") ?? null, SESSION_COOKIE_NAME),
      c.env.SESSION_SECRET,
    );
    if (!session || session.email !== c.env.ADMIN_EMAIL)
      return c.json({ error: "login_required" }, 401);
    if (
      c.req.header("Origin") !== mcpOrigin(c.env) ||
      !(await verifyCsrfToken(session, values.get("csrf")))
    ) {
      return c.json(
        {
          error: "invalid_request",
          error_description: "CSRF verification failed",
        },
        403,
      );
    }
    if (values.get("decision") === "deny")
      return redirectResponse(c.env, input.redirectUri, input.state, {
        error: "access_denied",
      });
    if (values.get("decision") !== "allow")
      return c.json({ error: "invalid_request" }, 400);
    const rate = checkRateLimit(
      `mcp-consent:${session.email}`,
      20,
      60 * 60 * 1000,
    );
    if (!rate.allowed) return c.json({ error: "slow_down" }, 429);
    const now = Date.now();
    const code = `pvm_c_${randomHex(32)}`;
    const grant: McpGrant = {
      id: randomHex(16),
      client_id: input.clientId,
      resource: mcpResource(c.env),
      scope: MCP_SCOPE,
      created_at: now,
      expires_at: now + GRANT_MS,
      revoked_at: null,
    };
    await createStore(c.env).createGrant(grant, {
      hash: await sha256Hex(code),
      grantId: grant.id,
      kind: "code",
      expiresAt: now + 5 * 60 * 1000,
      redirectUri: input.redirectUri,
      challenge: input.challenge,
    });
    return redirectResponse(c.env, input.redirectUri, input.state, { code });
  });

  app.post("/oauth/token", async (c) => {
    const values = await form(c);
    if (!(await authenticateClient(c, values)))
      return c.json({ error: "invalid_client" }, 401);
    if (values.get("resource") !== mcpResource(c.env))
      return c.json({ error: "invalid_target" }, 400);
    if (values.has("scope") && values.get("scope") !== MCP_SCOPE)
      return c.json({ error: "invalid_scope" }, 400);
    const type = values.get("grant_type");
    if (type !== "authorization_code" && type !== "refresh_token")
      return c.json({ error: "unsupported_grant_type" }, 400);
    const raw =
      values.get(type === "authorization_code" ? "code" : "refresh_token") ??
      "";
    if (!/^pvm_[cr]_[a-f0-9]{64}$/.test(raw))
      return c.json({ error: "invalid_grant" }, 400);
    const store = createStore(c.env);
    const hash = await sha256Hex(raw);
    const token = await store.getToken(hash);
    const now = Date.now();
    if (
      !validToken(token, c.env, now) ||
      token.kind !== (type === "authorization_code" ? "code" : "refresh")
    ) {
      return c.json({ error: "invalid_grant" }, 400);
    }
    if (type === "authorization_code") {
      const verifier = values.get("code_verifier") ?? "";
      if (
        values.get("redirect_uri") !== token.redirect_uri ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
        !(await fixedTimeEqual(
          await pkceChallenge(verifier),
          token.code_challenge ?? "",
        ))
      ) {
        return c.json({ error: "invalid_grant" }, 400);
      }
    }
    if (token.used_at !== null || !(await store.consume(hash, now))) {
      // Rotating refresh token reuse invalidates all access/refresh tokens for this connection.
      await store.revoke(token.id, now);
      return c.json({ error: "invalid_grant" }, 400);
    }
    return c.json(await issueTokens(store, token, now));
  });

  app.post("/oauth/revoke", async (c) => {
    const values = await form(c);
    if (!(await authenticateClient(c, values)))
      return c.json({ error: "invalid_client" }, 401);
    const token = await createStore(c.env).getToken(
      await sha256Hex(values.get("token") ?? ""),
    );
    if (token && token.client_id === c.env.MCP_OAUTH_CLIENT_ID)
      await createStore(c.env).revoke(token.id, Date.now());
    return c.json({});
  });

  app.get("/api/admin/mcp", requireAdmin, async (c) => {
    const enabled = c.env.MCP_ENABLED === "true";
    return c.json({
      enabled,
      oauthConfigured: oauthConfigured(c.env),
      endpoint: mcpResource(c.env),
      clientId: c.env.MCP_OAUTH_CLIENT_ID ?? null,
      connections:
        enabled && oauthConfigured(c.env)
          ? (await createStore(c.env).list()).map((grant) => ({
              id: grant.id,
              clientId: grant.client_id,
              createdAt: new Date(grant.created_at).toISOString(),
              expiresAt: new Date(grant.expires_at).toISOString(),
              revokedAt:
                grant.revoked_at === null
                  ? null
                  : new Date(grant.revoked_at).toISOString(),
            }))
          : [],
    });
  });
  app.delete("/api/admin/mcp/connections/:id", requireAdminWrite, async (c) => {
    if (c.env.MCP_ENABLED !== "true") return c.notFound();
    await createStore(c.env).revoke(c.req.param("id"), Date.now());
    return c.json({ ok: true });
  });
}

function resourceMetadata(c: Context<HonoRuntime>) {
  if (c.env.MCP_ENABLED !== "true") return c.notFound();
  c.header("Cache-Control", "no-store");
  return c.json({
    resource: mcpResource(c.env),
    resource_name: "PageVault uploads",
    authorization_servers: oauthConfigured(c.env) ? [mcpOrigin(c.env)] : [],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
  });
}
