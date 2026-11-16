import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

import { ADMIN_URL as ADMIN, PUBLIC_URL as PUBLIC } from "../urls.mjs";
const CALLBACK = "https://chatgpt.com/connector_platform_oauth_redirect";
const CLIENT = "pagevault-e2e-client";

async function loginForConsent(page) {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("hex");
  const query = new URLSearchParams({
    client_id: CLIENT,
    redirect_uri: CALLBACK,
    response_type: "code",
    scope: "assets:upload",
    resource: `${ADMIN}/mcp`,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  await page.route(`${CALLBACK}**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Test OAuth client callback</h1>",
    }),
  );
  await page.goto(`${ADMIN}/oauth/authorize?${query}`);
  await page.locator('input[type="email"]').fill("e2e@example.com");
  await page.locator('input[type="password"]').fill("pagevault-e2e");
  await page.locator('button[type="submit"]').click();
  await expect(
    page.getByRole("heading", { name: "允许通过聊天上传到 PageVault？" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/oauth\/authorize\?/);
  await expect(
    page.getByText(/上传默认公开，持有链接的人可访问/),
  ).toBeVisible();
  return { verifier, state };
}

async function rpc(request, token, method, params = {}) {
  const response = await request.post(`${ADMIN}/mcp`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
    },
    data: { jsonrpc: "2.0", id: 1, method, params },
  });
  const text = await response.text();
  const payload = response
    .headers()
    ["content-type"]?.startsWith("text/event-stream")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .at(-1)
        ?.slice(5)
    : text;
  return { status: response.status(), data: JSON.parse(payload ?? "{}") };
}

test("ChatGPT-style OAuth login, consent, upload, retry, share and UI revocation", async ({
  page,
  context,
}) => {
  const { verifier, state } = await loginForConsent(page);
  await page.getByRole("button", { name: "允许上传", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`^${CALLBACK}`));
  const callback = new URL(page.url());
  expect(callback.searchParams.get("state")).toBe(state);
  expect(callback.searchParams.get("iss")).toBe(ADMIN);
  const tokenResponse = await context.request.post(`${ADMIN}/oauth/token`, {
    form: {
      client_id: CLIENT,
      resource: `${ADMIN}/mcp`,
      grant_type: "authorization_code",
      code: callback.searchParams.get("code"),
      code_verifier: verifier,
      redirect_uri: CALLBACK,
    },
  });
  expect(tokenResponse.status()).toBe(200);
  const { access_token: token } = await tokenResponse.json();
  const tools = await rpc(context.request, token, "tools/list");
  expect(tools.status).toBe(200);
  expect(tools.data.result.tools).toHaveLength(3);
  const policy = (
    await rpc(context.request, token, "tools/call", {
      name: "get_upload_policy",
      arguments: {},
    })
  ).data.result.structuredContent;
  expect(policy).toMatchObject({
    defaultVisibility: "public",
    defaultUrlExpireDays: 15,
    defaultFileExpireDays: 30,
  });

  for (const [url, code, reason] of [
    [
      "https://unverified.example/PRIVATE.jpg?sig=SECRET",
      "file_host_not_allowed",
      "host_not_allowlisted",
    ],
    ["sandbox:/mnt/data/PRIVATE.jpg", "invalid_file_url", "https_required"],
  ]) {
    const denied = (
      await rpc(context.request, token, "tools/call", {
        name: "upload_asset",
        arguments: {
          filename: "ok.jpg",
          file: { file_id: "FILE_ID_SECRET", download_url: url },
        },
      })
    ).data.result;
    expect(denied.isError).toBe(true);
    expect(denied.structuredContent).toMatchObject({
      code,
      diagnostic: { reason },
    });
    expect(denied.structuredContent.requestId).toMatch(/^[a-f0-9]{24}$/);
    expect(JSON.stringify(denied)).not.toMatch(/PRIVATE|SECRET|mnt\/data/);
  }

  const args = {
    filename: "chatgpt-private.md",
    text: "# Private from chat\n\nOriginal bytes.",
    visibility: "private",
  };
  const privateResult = (
    await rpc(context.request, token, "tools/call", {
      name: "publish_text",
      arguments: args,
    })
  ).data.result;
  expect(privateResult.isError).not.toBe(true);
  const saved = privateResult.structuredContent;
  expect(saved).toMatchObject({
    visibility: "private",
    publicUrl: null,
    rawUrl: null,
    publicAvailable: false,
    replayed: false,
  });
  const repeated = (
    await rpc(context.request, token, "tools/call", {
      name: "publish_text",
      arguments: args,
    })
  ).data.result.structuredContent;
  expect(repeated).toMatchObject({ id: saved.id, replayed: true });
  const metadata = await (
    await context.request.get(`${ADMIN}/api/admin/items/${saved.id}`)
  ).json();
  expect((await context.request.get(metadata.publicUrl)).status()).not.toBe(
    200,
  );

  const published = (
    await rpc(context.request, token, "tools/call", {
      name: "publish_text",
      arguments: {
        filename: "chatgpt-public.html",
        text: "<!doctype html><title>Chat publish</title><h1>From chat</h1>",
      },
    })
  ).data.result.structuredContent;
  expect(published.publicUrl).toContain(`${PUBLIC}/p/`);
  expect(published.visibility).toBe("public");
  const publishedMetadata = await (
    await context.request.get(`${ADMIN}/api/admin/items/${published.id}`)
  ).json();
  expect(
    Date.parse(published.urlExpiresAt) -
      Date.parse(publishedMetadata.createdAt),
  ).toBe(15 * 86_400_000);
  expect(
    Date.parse(published.fileExpiresAt) -
      Date.parse(publishedMetadata.createdAt),
  ).toBe(30 * 86_400_000);
  await page.goto(published.publicUrl);
  await expect(page).toHaveTitle("Chat publish");
  await expect(
    page.frameLocator("iframe").getByRole("heading", { name: "From chat" }),
  ).toBeVisible();

  const settings = await (
    await context.request.get(`${ADMIN}/api/admin/mcp`)
  ).json();
  const connectionId = settings.connections[0].id;
  await page.goto(`${ADMIN}/#/api-keys`);
  await page.getByText("ChatGPT / MCP", { exact: true }).click();
  await expect(page.getByText(`${ADMIN}/mcp`, { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Public by default: anyone with the link can view the file/),
  ).toBeVisible();
  await page
    .locator(`[data-connection-id="${connectionId}"]`)
    .getByRole("button", { name: "Revoke connection" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Revoke connection" })
    .click();
  await expect(
    page
      .locator(`[data-connection-id="${connectionId}"]`)
      .getByRole("button", { name: "Inactive" }),
  ).toBeDisabled();
  expect((await rpc(context.request, token, "tools/list")).status).toBe(401);
  // Revoking the uploader never deletes a file that was already published.
  expect((await context.request.get(published.publicUrl)).status()).toBe(200);
});

test("OAuth cancellation grants nothing and public hostname exposes no MCP/auth endpoints", async ({
  page,
  context,
}) => {
  const { state } = await loginForConsent(page);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`^${CALLBACK}`));
  const callback = new URL(page.url());
  expect(callback.searchParams.get("state")).toBe(state);
  expect(callback.searchParams.get("error")).toBe("access_denied");
  expect(callback.searchParams.has("code")).toBe(false);
  for (const path of [
    "/mcp",
    "/oauth/authorize",
    "/.well-known/oauth-protected-resource/mcp",
    "/mcp-guide.md",
  ]) {
    expect((await context.request.get(`${PUBLIC}${path}`)).status()).toBe(404);
  }
  expect((await context.request.get(`${ADMIN}/mcp`)).status()).toBe(401);
  const guide = await context.request.get(`${ADMIN}/mcp-guide.md`);
  expect(guide.status()).toBe(200);
  expect(guide.headers()["content-type"]).toContain("text/markdown");
});
