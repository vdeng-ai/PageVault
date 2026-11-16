import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@pagevault/core";
import { authenticateOAuth, oauthGrantDays } from "../mcp/oauth.js";
import { resetRateLimit } from "../rate-limit.js";
import { mcpFixture, oauthTokensSchema } from "./mcp-fixture.js";
import { z } from "zod";

type Fixture = Awaited<ReturnType<typeof mcpFixture>>;
const fixtures: Fixture[] = [];
async function fixture() {
  const f = await mcpFixture();
  fixtures.push(f);
  return f;
}
afterEach(async () => {
  vi.restoreAllMocks();
  resetRateLimit("oauth-token:unknown");
  resetRateLimit("mcp-consent:admin@example.com");
  resetRateLimit("mcp-auth:unknown");
  for (const f of fixtures.splice(0)) await f.close();
});

describe("MCP OAuth", () => {
  it("defaults unset/blank configuration to 365 days and accepts integer overrides", () => {
    expect(oauthGrantDays({})).toBe(365);
    expect(oauthGrantDays({ MCP_OAUTH_GRANT_DAYS: " " })).toBe(365);
    for (const days of [1, 30, 90, 365, 730, 3650]) {
      expect(oauthGrantDays({ MCP_OAUTH_GRANT_DAYS: ` ${days} ` })).toBe(days);
    }
  });

  it.each(["0", "-1", "1.5", "365days", "1e3", "NaN", "Infinity", "3651"])(
    "rejects invalid grant-day configuration %s rather than silently changing it",
    (value) => {
      expect(() => oauthGrantDays({ MCP_OAUTH_GRANT_DAYS: value })).toThrow(
        "MCP_OAUTH_GRANT_DAYS must be an integer from 1 to 3650",
      );
    },
  );

  it.each([undefined, "90", "730"])(
    "uses configured days (%s) in consent, saved grant, refresh expiry and admin settings",
    async (configured) => {
      const f = await fixture();
      if (configured !== undefined) f.env.MCP_OAUTH_GRANT_DAYS = configured;
      const days = configured === undefined ? 365 : Number(configured);
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);
      const query = await f.authorizationValues();
      const consent = await f.call(`/oauth/authorize?${query}`, {
        headers: { Cookie: f.cookie },
      });
      expect(consent.status).toBe(200);
      expect(await consent.text()).toContain(`本次授权有效 ${days} 天`);
      const tokens = await f.authorize();
      const grant = (await f.store.list())[0]!;
      expect(grant.expires_at - grant.created_at).toBe(days * 86_400_000);
      expect(tokens.expires_in).toBe(3600);
      expect(
        await f.store.getToken(await sha256Hex(tokens.access_token)),
      ).toMatchObject({
        token_expires_at: now + 3600_000,
      });
      expect(
        await f.store.getToken(await sha256Hex(tokens.refresh_token)),
      ).toMatchObject({
        token_expires_at: grant.expires_at,
      });
      const settings = await f.call("/api/admin/mcp", {
        headers: { Cookie: f.cookie },
      });
      expect(await settings.json()).toMatchObject({
        grantDays: days,
        accessTokenSeconds: 3600,
        connections: [
          { id: grant.id, expiresAt: new Date(grant.expires_at).toISOString() },
        ],
      });
    },
  );

  it("does not issue an authorization code when grant-day configuration is invalid", async () => {
    const f = await fixture();
    f.env.MCP_OAUTH_GRANT_DAYS = "0";
    const values = await f.authorizationValues();
    values.set("decision", "allow");
    values.set("csrf", f.csrf);
    const response = await f.call("/oauth/authorize", {
      method: "POST",
      headers: { Cookie: f.cookie, Origin: f.env.ADMIN_BASE_URL },
      body: values,
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      code: "invalid_mcp_oauth_grant_days",
    });
    expect(await f.store.list()).toEqual([]);
  });

  it("refreshes beyond day 30, caps access at one hour and rejects both tokens at the fixed grant deadline", async () => {
    const f = await fixture();
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    let current = await f.authorize();
    const grant = (await f.store.list())[0]!;

    for (const elapsed of [
      3600_000,
      31 * 86_400_000,
      365 * 86_400_000 - 15_000,
    ]) {
      clock.mockReturnValue(now + elapsed);
      expect(
        (await f.rpc("tools/list", {}, current.access_token)).response.status,
      ).toBe(401);
      const response = await f.tokenForm({
        grant_type: "refresh_token",
        refresh_token: current.refresh_token,
      });
      expect(response.status).toBe(200);
      const next = oauthTokensSchema.parse(await response.json());
      expect(next.refresh_token).not.toBe(current.refresh_token);
      expect(next.access_token).not.toBe(current.access_token);
      expect(next.expires_in).toBe(
        Math.min(3600, (grant.expires_at - Date.now()) / 1000),
      );
      const refresh = await f.store.getToken(
        await sha256Hex(next.refresh_token),
      );
      expect(refresh).toMatchObject({
        id: grant.id,
        token_expires_at: grant.expires_at,
      });
      expect(
        (await f.rpc("tools/list", {}, next.access_token)).response.status,
      ).toBe(200);
      current = next;
    }
    expect((await f.store.list())[0]?.expires_at).toBe(grant.expires_at);
    clock.mockReturnValue(grant.expires_at);
    expect(
      (await f.rpc("tools/list", {}, current.access_token)).response.status,
    ).toBe(401);
    const expired = await f.tokenForm({
      grant_type: "refresh_token",
      refresh_token: current.refresh_token,
    });
    expect(expired.status).toBe(400);
    expect(await expired.json()).toEqual({ error: "invalid_grant" });
  });

  it("preserves old 30-day grants on refresh; only fresh consent gets the new configured period", async () => {
    const f = await fixture();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    f.env.MCP_OAUTH_GRANT_DAYS = "30";
    const old = await f.authorize();
    const oldGrant = (await f.store.list())[0]!;
    f.env.MCP_OAUTH_GRANT_DAYS = "365";
    const refresh = await f.tokenForm({
      grant_type: "refresh_token",
      refresh_token: old.refresh_token,
    });
    expect(refresh.status).toBe(200);
    const rotated = oauthTokensSchema.parse(await refresh.json());
    expect(
      await f.store.getToken(await sha256Hex(rotated.refresh_token)),
    ).toMatchObject({
      id: oldGrant.id,
      expires_at: now + 30 * 86_400_000,
      token_expires_at: now + 30 * 86_400_000,
    });
    const fresh = await f.authorize();
    expect(
      await f.store.getToken(await sha256Hex(fresh.refresh_token)),
    ).toMatchObject({
      expires_at: now + 365 * 86_400_000,
      token_expires_at: now + 365 * 86_400_000,
    });
    expect(
      (await f.store.list()).find((grant) => grant.id === oldGrant.id),
    ).toEqual(oldGrant);
  });

  it.each(["client_secret_post", "client_secret_basic"])(
    "supports a confidential predefined client using %s",
    async (method) => {
      const f = await fixture();
      f.env.MCP_OAUTH_CLIENT_SECRET = "local-confidential-client-test-only";
      const code = await f.grantCode();
      const values = {
        grant_type: "authorization_code",
        code,
        redirect_uri: f.env.MCP_OAUTH_REDIRECT_URIS!,
        code_verifier: "v".repeat(64),
      };
      expect((await f.tokenForm(values)).status).toBe(401);
      expect(
        (await f.tokenForm({ ...values, client_secret: "wrong-secret" }))
          .status,
      ).toBe(401);
      const response =
        method === "client_secret_post"
          ? await f.tokenForm({
              ...values,
              client_secret: f.env.MCP_OAUTH_CLIENT_SECRET,
            })
          : await f.call("/oauth/token", {
              method: "POST",
              headers: {
                Authorization: `Basic ${btoa(`${f.env.MCP_OAUTH_CLIENT_ID}:${f.env.MCP_OAUTH_CLIENT_SECRET}`)}`,
              },
              body: new URLSearchParams({
                ...values,
                resource: `${f.env.ADMIN_BASE_URL}/mcp`,
              }),
            });
      expect(response.status).toBe(200);
      const tokens = oauthTokensSchema.parse(await response.json());
      expect(
        (await f.rpc("tools/list", {}, tokens.access_token)).response.status,
      ).toBe(200);
    },
  );

  it("publishes resource, PKCE and issuer metadata without D1 writes", async () => {
    const f = await fixture();
    expect(
      await (await f.call("/.well-known/oauth-protected-resource/mcp")).json(),
    ).toMatchObject({
      resource: "https://admin.example.com/mcp",
      authorization_servers: ["https://admin.example.com"],
      scopes_supported: ["assets:upload"],
    });
    expect(
      await (await f.call("/.well-known/oauth-authorization-server")).json(),
    ).toMatchObject({
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      authorization_response_iss_parameter_supported: true,
    });
    expect(await f.store.list()).toEqual([]);
  });

  it("requires admin login, explicit consent and CSRF; denies unknown callbacks", async () => {
    const f = await fixture();
    const values = await f.authorizationValues();
    const login = await f.call(`/oauth/authorize?${values}`);
    expect(login.status).toBe(303);
    expect(login.headers.get("Location")).toContain("oauthReturnTo=");
    const consent = await f.call(`/oauth/authorize?${values}`, {
      headers: { Cookie: f.cookie },
    });
    expect(consent.status).toBe(200);
    expect(consent.headers.get("Referrer-Policy")).toBe("same-origin");
    expect(await consent.text()).toContain("允许上传");
    expect(consent.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(consent.headers.get("Content-Security-Policy")).toContain(
      "form-action 'self' https://chatgpt.com",
    );
    expect(
      (
        await f.call("/oauth/authorize", {
          method: "POST",
          headers: { Cookie: f.cookie, Origin: f.env.ADMIN_BASE_URL },
          body: values,
        })
      ).status,
    ).toBe(403);
    values.set("redirect_uri", "https://evil.example/callback");
    const denied = await f.call(`/oauth/authorize?${values}`, {
      headers: { Cookie: f.cookie },
    });
    expect(denied.status).toBe(400);
    expect(denied.headers.has("Location")).toBe(false);
    expect(await f.store.list()).toEqual([]);
  });

  it("returns issuer and state on denial without creating a grant", async () => {
    const f = await fixture();
    const values = await f.authorizationValues();
    values.set("decision", "deny");
    values.set("csrf", f.csrf);
    const response = await f.call("/oauth/authorize", {
      method: "POST",
      headers: { Cookie: f.cookie, Origin: f.env.ADMIN_BASE_URL },
      body: values,
    });
    const redirect = new URL(response.headers.get("Location")!);
    expect(redirect.searchParams.get("error")).toBe("access_denied");
    expect(redirect.searchParams.get("iss")).toBe(f.env.ADMIN_BASE_URL);
    expect(redirect.searchParams.get("state")).toBe("test-state");
    expect(await f.store.list()).toEqual([]);
  });

  it("binds code exchange to client, resource, redirect and PKCE without consuming on mismatch", async () => {
    const f = await fixture();
    const code = await f.grantCode();
    const values = {
      grant_type: "authorization_code",
      code,
      redirect_uri: f.env.MCP_OAUTH_REDIRECT_URIS!,
      code_verifier: "v".repeat(64),
    };
    for (const changes of [
      { code_verifier: "x".repeat(64) },
      { redirect_uri: "https://evil.example" },
      { resource: "https://other.example/mcp" },
      { client_id: "another" },
    ]) {
      expect(
        (await f.tokenForm({ ...values, ...changes })).status,
      ).toBeGreaterThanOrEqual(400);
    }
    const response = await f.tokenForm(values);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const tokens = oauthTokensSchema.parse(await response.json());
    expect(
      (await f.rpc("tools/list", {}, tokens.access_token)).response.status,
    ).toBe(200);
    // Existing REST API keys and OAuth grants do not acquire each other's privileges.
    expect(
      (
        await f.call("/api/admin/items", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        })
      ).status,
    ).toBe(401);
    expect((await f.tokenForm(values)).status).toBe(400);
  });

  it("rotates refresh tokens; reuse revokes the entire connection", async () => {
    const f = await fixture();
    const first = await f.authorize();
    const response = await f.tokenForm({
      grant_type: "refresh_token",
      refresh_token: first.refresh_token,
    });
    expect(response.status).toBe(200);
    const second = oauthTokensSchema.parse(await response.json());
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect(
      (await f.rpc("tools/list", {}, second.access_token)).response.status,
    ).toBe(200);
    expect(
      (
        await f.tokenForm({
          grant_type: "refresh_token",
          refresh_token: first.refresh_token,
        })
      ).status,
    ).toBe(400);
    expect(
      (await f.rpc("tools/list", {}, second.access_token)).response.status,
    ).toBe(401);
    expect(
      (
        await f.tokenForm({
          grant_type: "refresh_token",
          refresh_token: second.refresh_token,
        })
      ).status,
    ).toBe(400);
  });

  it("persists hashes, expires access tokens and supports immediate administrator revocation", async () => {
    const f = await fixture();
    const token = await f.authorize();
    expect(await f.store.getToken(token.access_token)).toBeNull();
    const record = await f.store.getToken(await sha256Hex(token.access_token));
    expect(record?.kind).toBe("access");
    expect(
      await authenticateOAuth(
        token.access_token,
        f.env,
        f.store,
        Date.now() + 2 * 3600_000,
      ),
    ).toBeNull();
    const response = await f.call("/api/admin/mcp", {
      headers: { Cookie: f.cookie },
    });
    const data = z
      .object({ connections: z.array(z.object({ id: z.string() })) })
      .parse(await response.json());
    const id = data.connections[0]!.id;
    expect(
      (
        await f.call(`/api/admin/mcp/connections/${id}`, {
          method: "DELETE",
          headers: { Cookie: f.cookie },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await f.call(`/api/admin/mcp/connections/${id}`, {
          method: "DELETE",
          headers: { Cookie: f.cookie, "X-CSRF-Token": f.csrf },
        })
      ).status,
    ).toBe(200);
    expect(
      (await f.rpc("tools/list", {}, token.access_token)).response.status,
    ).toBe(401);
    expect(
      (
        await f.tokenForm({
          grant_type: "refresh_token",
          refresh_token: token.refresh_token,
        })
      ).status,
    ).toBe(400);
  });

  it("consumes an authorization code exactly once under concurrent exchanges", async () => {
    const f = await fixture();
    const code = await f.grantCode();
    const hash = await sha256Hex(code);
    const outcomes = await Promise.all([
      f.store.consume(hash, Date.now()),
      f.store.consume(hash, Date.now()),
    ]);
    expect(outcomes.sort()).toEqual([false, true]);
  });
});
