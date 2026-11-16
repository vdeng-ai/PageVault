import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { URL, URLSearchParams } from "node:url";
import { pbkdf2Sha256 } from "../packages/core/dist/index.js";

// Real workerd + local D1/R2, never a remote database or the production Worker.
// Run after pnpm run build. No live credentials or external file downloads needed.
const root = resolve(import.meta.dirname, "..");
const { fetch } = globalThis;
const temporary = await mkdtemp(resolve(tmpdir(), "pagevault-mcp-smoke-"));
const state = resolve(temporary, "state");
const envFile = resolve(temporary, ".env");
const callback = "https://chatgpt.com/connector_platform_oauth_redirect";
const clientId = "pagevault-local-smoke";
const password = randomBytes(24).toString("hex");
const checks = [];
let worker;
let output = "";

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return port;
}

async function waitForReady(origin) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (worker.exitCode !== null) throw new Error("Local Worker exited early");
    try {
      if ((await fetch(`${origin}/readyz`)).ok) return;
    } catch {
      // Only the isolated process's startup is retried.
    }
    await delay(500);
  }
  throw new Error("Local Worker did not become ready");
}

try {
  const port = await freePort();
  const inspectorPort = await freePort();
  const admin = `http://localhost:${port}`;
  const publicOrigin = `http://127.0.0.1:${port}`;
  const resource = `${admin}/mcp`;
  const values = {
    APP_ENV: "production",
    ADMIN_BASE_URL: admin,
    PUBLIC_BASE_URL: publicOrigin,
    ADMIN_EMAIL: "smoke@example.invalid",
    ADMIN_PASSWORD_HASH: await pbkdf2Sha256(password),
    SESSION_SECRET: randomBytes(32).toString("hex"),
    DEFAULT_URL_EXPIRE_DAYS: "15",
    DEFAULT_FILE_EXPIRE_DAYS: "30",
    MAX_UPLOAD_SIZE_MB: "10",
  };
  await writeFile(
    envFile,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
    { mode: 0o600 },
  );
  const baseArgs = ["--filter", "@pagevault/worker", "exec", "wrangler"];
  const childEnv = {
    ...process.env,
    CI: "true",
    WRANGLER_SEND_METRICS: "false",
  };
  const migrate = spawnSync(
    "pnpm",
    [
      ...baseArgs,
      "d1",
      "migrations",
      "apply",
      "pagevault-db",
      "--local",
      "--persist-to",
      state,
    ],
    { cwd: root, env: childEnv, encoding: "utf8" },
  );
  assert.equal(migrate.status, 0, migrate.stderr || migrate.stdout);
  checks.push("additive migrations on isolated local D1");

  worker = spawn(
    "pnpm",
    [
      ...baseArgs,
      "dev",
      "--local",
      "--env-file",
      envFile,
      "--persist-to",
      state,
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--inspector-port",
      String(inspectorPort),
      "--test-scheduled",
      "--log-level",
      "warn",
      "--var",
      "MCP_ENABLED:true",
      "--var",
      `MCP_OAUTH_CLIENT_ID:${clientId}`,
      "--var",
      `MCP_OAUTH_REDIRECT_URIS:${callback}`,
      "--var",
      "ACCESS_COUNT_MODE:off",
    ],
    {
      cwd: root,
      env: childEnv,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const collect = (chunk) => {
    output = (output + chunk.toString()).slice(-20000);
  };
  worker.stdout.on("data", collect);
  worker.stderr.on("data", collect);
  await waitForReady(admin);

  async function call(path, options = {}) {
    return fetch(`${admin}${path}`, { ...options, redirect: "manual" });
  }
  async function rpc(token, method, params = {}) {
    const response = await call("/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    assert.equal(response.status, 200, `${method}: HTTP ${response.status}`);
    const text = await response.text();
    const data = response.headers
      .get("Content-Type")
      ?.includes("text/event-stream")
      ? text
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .at(-1)
          ?.slice(5)
      : text;
    const payload = JSON.parse(data);
    assert.equal(payload.error, undefined);
    assert.notEqual(
      payload.result.isError,
      true,
      JSON.stringify(payload.result),
    );
    return payload.result;
  }
  const denied = await call("/mcp");
  assert.equal(denied.status, 401);
  assert.match(
    denied.headers.get("WWW-Authenticate"),
    /oauth-protected-resource\/mcp/,
  );
  for (const path of [
    "/mcp",
    "/oauth/authorize",
    "/.well-known/oauth-protected-resource/mcp",
  ]) {
    assert.equal((await fetch(`${publicOrigin}${path}`)).status, 404);
  }
  const discovery = await (
    await call("/.well-known/oauth-authorization-server")
  ).json();
  assert.equal(discovery.authorization_response_iss_parameter_supported, true);
  checks.push("host isolation, 401 challenge and OAuth discovery");

  const login = await call("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: values.ADMIN_EMAIL, password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("Set-Cookie").split(";")[0];
  const me = await (
    await call("/api/auth/me", { headers: { Cookie: cookie } })
  ).json();
  const verifier = randomBytes(32).toString("base64url");
  const authState = randomBytes(16).toString("hex");
  const authorize = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    response_type: "code",
    scope: "assets:upload",
    resource,
    state: authState,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  assert.equal((await call(`/oauth/authorize?${authorize}`)).status, 303);
  assert.equal(
    (
      await call(`/oauth/authorize?${authorize}`, {
        headers: { Cookie: cookie },
      })
    ).status,
    200,
  );
  authorize.set("csrf", me.csrfToken);
  authorize.set("decision", "allow");
  const consent = await call("/oauth/authorize", {
    method: "POST",
    headers: { Cookie: cookie, Origin: admin },
    body: authorize,
  });
  assert.equal(consent.status, 303);
  const redirect = new URL(consent.headers.get("Location"));
  assert.equal(redirect.searchParams.get("state"), authState);
  assert.equal(redirect.searchParams.get("iss"), admin);
  const exchange = await call("/oauth/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      resource,
      grant_type: "authorization_code",
      code: redirect.searchParams.get("code"),
      code_verifier: verifier,
      redirect_uri: callback,
    }),
  });
  assert.equal(exchange.status, 200);
  const tokens = await exchange.json();
  const tools = (await rpc(tokens.access_token, "tools/list")).tools;
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    "get_upload_policy",
    "publish_text",
    "upload_asset",
  ]);
  assert.deepEqual(
    tools.find((tool) => tool.name === "upload_asset")._meta[
      "openai/fileParams"
    ],
    ["file"],
  );
  const policy = (
    await rpc(tokens.access_token, "tools/call", {
      name: "get_upload_policy",
      arguments: {},
    })
  ).structuredContent;
  assert.equal(policy.maxUploadSizeBytes, 10 * 1024 * 1024);
  checks.push("PKCE consent, code exchange and three MCP tools in workerd");

  const privateArgs = {
    filename: "smoke.md",
    text: "# Private\n\nPreserve these bytes.\n",
  };
  const save = async (args, token = tokens.access_token) =>
    (await rpc(token, "tools/call", { name: "publish_text", arguments: args }))
      .structuredContent;
  const saved = await save(privateArgs);
  assert.equal(saved.visibility, "private");
  assert.equal(saved.publicUrl, null);
  const preview = await call(`/api/admin/items/${saved.id}/preview`, {
    headers: { Cookie: cookie },
  });
  assert.equal(preview.status, 200);
  const retry = await save(privateArgs);
  assert.equal(retry.id, saved.id);
  assert.equal(retry.replayed, true);

  const publicArgs = {
    filename: "smoke.html",
    text: "<!doctype html><title>MCP smoke</title><h1>Original</h1>",
    visibility: "public",
  };
  const published = await save(publicArgs);
  assert.equal((await fetch(published.publicUrl)).status, 200);
  assert.equal(await (await fetch(published.rawUrl)).text(), publicArgs.text);
  checks.push(
    "private default, idempotency, public viewer and byte-exact local R2 delivery",
  );

  const refresh = await call("/oauth/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      resource,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    }),
  });
  assert.equal(refresh.status, 200);
  const rotated = await refresh.json();
  assert.notEqual(rotated.refresh_token, tokens.refresh_token);
  assert.equal((await save(privateArgs, rotated.access_token)).id, saved.id);
  const revoke = await call("/oauth/revoke", {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      token: rotated.refresh_token,
    }),
  });
  assert.equal(revoke.status, 200);
  assert.equal(
    (
      await call("/mcp", {
        headers: { Authorization: `Bearer ${rotated.access_token}` },
      })
    ).status,
    401,
  );
  assert.equal((await fetch(published.publicUrl)).status, 200);
  checks.push(
    "refresh preserves idempotency; revocation blocks tokens without deleting files",
  );

  const expire = await call(`/api/admin/items/${published.id}`, {
    method: "PATCH",
    headers: {
      Cookie: cookie,
      Origin: admin,
      "X-CSRF-Token": me.csrfToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileExpiresAt: new Date(Date.now() - 60000).toISOString(),
    }),
  });
  assert.equal(expire.status, 200);
  const scheduled = await call(
    `/__scheduled?cron=${encodeURIComponent("17 3 * * *")}`,
  );
  assert.equal(scheduled.status, 200);
  let deleted = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const item = await (
      await call(`/api/admin/items/${published.id}`, {
        headers: { Cookie: cookie },
      })
    ).json();
    if (item.status === "deleted") {
      deleted = true;
      break;
    }
    await delay(250);
  }
  assert.equal(
    deleted,
    true,
    "Daily maintenance must delete the expired test object",
  );
  assert.notEqual((await fetch(published.publicUrl)).status, 200);
  checks.push(
    "daily scheduled retention and OAuth cleanup in real local bindings",
  );
  process.stdout.write(
    `${JSON.stringify({ ok: true, runtime: "local workerd", remoteWrites: false, checks }, null, 2)}\n`,
  );
} catch (error) {
  process.stderr.write(`${output}\n${error.stack ?? error}\n`);
  process.exitCode = 1;
} finally {
  if (worker && worker.exitCode === null) {
    const stopped = once(worker, "exit");
    if (process.platform === "win32") worker.kill("SIGTERM");
    else process.kill(-worker.pid, "SIGTERM");
    await stopped;
  }
  await rm(temporary, { recursive: true, force: true });
}
