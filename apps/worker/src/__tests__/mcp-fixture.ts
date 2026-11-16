import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createPageVaultConfig,
  createSession,
  PageVaultService,
} from "@pagevault/core";
import { NodeSqliteRepository } from "../adapters/node-db.js";
import { LocalFileStorage } from "../adapters/node-storage.js";
import { createRequestHandler } from "../app.js";
import type { AppBindings } from "../bindings.js";
import { pkceChallenge } from "../mcp/oauth.js";
import { z } from "zod";

export const oauthTokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  scope: z.string(),
});

export async function mcpFixture(fetchFile: typeof fetch = fetch) {
  const dir = await mkdtemp(join(tmpdir(), "pagevault-mcp-"));
  const repository = NodeSqliteRepository.open(join(dir, "db.sqlite"));
  const migrations = resolve(import.meta.dirname, "../../../../migrations");
  for (const file of (await readdir(migrations))
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    await repository.migrate(join(migrations, file));
  }
  const storage = new LocalFileStorage(join(dir, "objects"));
  const service = new PageVaultService(
    repository,
    storage,
    createPageVaultConfig({ publicBaseUrl: "https://public.example.com" }),
  );
  const store = repository.createMcpStore();
  const env: AppBindings = {
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_PASSWORD_HASH: "unused-in-session-tests",
    SESSION_SECRET: "local-mcp-test-secret-not-a-production-credential",
    ADMIN_BASE_URL: "https://admin.example.com",
    PUBLIC_BASE_URL: "https://public.example.com",
    APP_ENV: "production",
    MCP_ENABLED: "true",
    MCP_OAUTH_CLIENT_ID: "pagevault-test-client",
    MCP_OAUTH_REDIRECT_URIS:
      "https://chatgpt.com/connector_platform_oauth_redirect",
  };
  const handler = createRequestHandler({
    createService: () => service,
    createMcpStore: () => store,
    fetchMcpFile: fetchFile,
    fetchAsset: async () => new Response("admin shell"),
  });
  const session = await createSession(env.ADMIN_EMAIL, env.SESSION_SECRET);
  const cookie = `pagevault_session=${session.value}`;
  const csrf = session.session.csrfToken;
  const call = (path: string, init?: RequestInit) =>
    handler(new Request(`${env.ADMIN_BASE_URL}${path}`, init), env);
  const key = await service.createApiKey("MCP test");

  async function rpc(
    method: string,
    params: Record<string, unknown> = {},
    token = key.token,
  ) {
    const response = await call("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const text = await response.text();
    const jsonText = response.headers
      .get("Content-Type")
      ?.startsWith("text/event-stream")
      ? (text
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .at(-1)
          ?.slice(5) ?? "{}")
      : text;
    return { response, data: JSON.parse(jsonText) as Record<string, unknown> };
  }

  async function authorizationValues(verifier = "v".repeat(64)) {
    return new URLSearchParams({
      client_id: env.MCP_OAUTH_CLIENT_ID!,
      redirect_uri: env.MCP_OAUTH_REDIRECT_URIS!,
      resource: `${env.ADMIN_BASE_URL}/mcp`,
      scope: "assets:upload",
      response_type: "code",
      state: "test-state",
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: "S256",
    });
  }
  async function grantCode() {
    const values = await authorizationValues();
    values.set("csrf", csrf);
    values.set("decision", "allow");
    const response = await call("/oauth/authorize", {
      method: "POST",
      headers: { Cookie: cookie, Origin: env.ADMIN_BASE_URL },
      body: values,
    });
    const location = response.headers.get("Location");
    if (!location) throw new Error(`Consent failed: ${await response.text()}`);
    return new URL(location).searchParams.get("code")!;
  }
  async function tokenForm(values: Record<string, string>) {
    return call("/oauth/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: env.MCP_OAUTH_CLIENT_ID!,
        resource: `${env.ADMIN_BASE_URL}/mcp`,
        ...values,
      }),
    });
  }
  async function authorize() {
    const code = await grantCode();
    const response = await tokenForm({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.MCP_OAUTH_REDIRECT_URIS!,
      code_verifier: "v".repeat(64),
    });
    if (!response.ok) throw new Error(`Token failed: ${await response.text()}`);
    return oauthTokensSchema.parse(await response.json());
  }
  return {
    env,
    store,
    service,
    storage,
    repository,
    cookie,
    csrf,
    key,
    handler,
    call,
    rpc,
    authorizationValues,
    grantCode,
    tokenForm,
    authorize,
    close: async () => {
      repository.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
