import { expect, test } from "@playwright/test";

const ADMIN_URL = "http://localhost:3100";
const PUBLIC_URL = "http://127.0.0.1:3100";

async function login(page) {
  await page.goto(ADMIN_URL);
  await page.locator('input[type="email"]').fill("e2e@example.com");
  await page.locator('input[type="password"]').fill("pagevault-e2e");
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: "Upload" })).toBeVisible();
}

async function uploadViaUi(
  page,
  {
    name,
    mimeType,
    buffer,
    visibility = "public",
  },
) {
  await page.goto(`${ADMIN_URL}/#/`);
  // Reload to reset UploadPage component state when a test publishes more than
  // one file from the same browser session.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Upload" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType,
    buffer,
  });

  if (visibility === "private") {
    await page.locator('input[name="visibility"][value="private"]').check();
  }

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${ADMIN_URL}/api/admin/items` &&
      response.request().method() === "POST",
  );
  await page.locator(".upload-submit-bar .btn-primary").click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const result = await response.json();

  await expect(
    page.getByRole("heading", { name: "Your file is live" }),
  ).toBeVisible();
  await expect(page.locator('input[aria-label="Share link"]')).toHaveValue(
    result.publicUrl,
  );
  return result;
}

async function adminJson(page, path, method, body) {
  return page.evaluate(
    async ({ path: requestPath, method: requestMethod, body: requestBody }) => {
      const meResponse = await fetch("/api/auth/me");
      const me = await meResponse.json();
      if (!me.csrfToken) {
        throw new Error("Missing CSRF token");
      }
      const response = await fetch(requestPath, {
        method: requestMethod,
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": me.csrfToken,
        },
        body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
      });
      const data = await response.json().catch(() => ({}));
      return { status: response.status, data };
    },
    { path, method, body },
  );
}

test("HTML UI upload keeps share/raw behavior and works on a mobile viewport", async ({
  page,
  context,
}) => {
  await login(page);
  const source =
    "<!doctype html><html><head><title>中文测试</title></head><body><h1>你好 PageVault</h1></body></html>";
  const uploaded = await uploadViaUi(page, {
    name: "产品介绍.html",
    mimeType: "text/html",
    buffer: Buffer.from(source),
  });

  expect(uploaded.publicUrl).toContain(`${PUBLIC_URL}/p/`);
  const rawUrl = `${PUBLIC_URL}/raw/${encodeURIComponent(uploaded.slug)}`;

  const share = await context.request.get(uploaded.publicUrl);
  expect(share.status()).toBe(200);
  expect(share.headers()["content-type"]).toContain("text/html");
  const shareHtml = await share.text();
  expect(shareHtml).toContain("产品介绍");
  expect(shareHtml).toContain(rawUrl);

  const raw = await context.request.get(rawUrl);
  expect(raw.status()).toBe(200);
  expect(await raw.text()).toBe(source);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(uploaded.publicUrl);
  await expect(page.locator(".share-viewer-shell")).toBeVisible();
  await expect(page.locator(".share-viewer-title")).toContainText("产品介绍");
  await expect(page.locator(".share-viewer-frame")).toBeVisible();
});

test("Markdown, PDF range, and SVG use their lightweight public delivery paths", async ({
  page,
  context,
}) => {
  await login(page);

  const markdown = await uploadViaUi(page, {
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Notes\n\n## Install\n\n**Ready**"),
  });
  const markdownShare = await context.request.get(markdown.publicUrl);
  expect(markdownShare.status()).toBe(200);
  const markdownHtml = await markdownShare.text();
  expect(markdownHtml).toContain('<h1 id="notes">Notes</h1>');
  expect(markdownHtml).toContain("<strong>Ready</strong>");

  const pdfBytes = Buffer.from("%PDF-1.7\n0123456789abcdef");
  const pdf = await uploadViaUi(page, {
    name: "report.pdf",
    mimeType: "application/pdf",
    buffer: pdfBytes,
  });
  const pdfRawUrl = `${PUBLIC_URL}/raw/${encodeURIComponent(pdf.slug)}`;
  const pdfRange = await context.request.get(pdfRawUrl, {
    headers: { Range: "bytes=0-4" },
  });
  expect(pdfRange.status()).toBe(206);
  expect(pdfRange.headers()["accept-ranges"]).toBe("bytes");
  expect(pdfRange.headers()["content-range"]).toBe(
    `bytes 0-4/${pdfBytes.byteLength}`,
  );
  expect(await pdfRange.text()).toBe("%PDF-");

  const svgSource =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>';
  const svg = await uploadViaUi(page, {
    name: "diagram.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(svgSource),
  });
  const svgRawUrl = `${PUBLIC_URL}/raw/${encodeURIComponent(svg.slug)}`;
  const svgShare = await context.request.get(svg.publicUrl);
  expect(await svgShare.text()).toContain(
    `<meta property="og:image" content="${svgRawUrl}">`,
  );
  const svgRaw = await context.request.get(svgRawUrl);
  expect(svgRaw.status()).toBe(200);
  expect(svgRaw.headers()["content-type"]).toContain("image/svg+xml");
  expect(await svgRaw.text()).toBe(svgSource);
});

test("private, disabled, and expired records map to the expected public states", async ({
  page,
  context,
}) => {
  await login(page);
  const uploaded = await uploadViaUi(page, {
    name: "state-test.html",
    mimeType: "text/html",
    buffer: Buffer.from("<h1>state</h1>"),
    visibility: "private",
  });

  expect((await context.request.get(uploaded.publicUrl)).status()).toBe(404);

  const makePublic = await adminJson(
    page,
    `/api/admin/items/${uploaded.id}`,
    "PATCH",
    { visibility: "public" },
  );
  expect(makePublic.status).toBe(200);
  expect((await context.request.get(uploaded.publicUrl)).status()).toBe(200);

  const disable = await adminJson(
    page,
    `/api/admin/items/${uploaded.id}`,
    "PATCH",
    { status: "disabled" },
  );
  expect(disable.status).toBe(200);
  expect((await context.request.get(uploaded.publicUrl)).status()).toBe(403);

  const expire = await adminJson(
    page,
    `/api/admin/items/${uploaded.id}`,
    "PATCH",
    {
      status: "active",
      urlExpiresAt: "2000-01-01T00:00:00.000Z",
    },
  );
  expect(expire.status).toBe(200);
  expect((await context.request.get(uploaded.publicUrl)).status()).toBe(410);
});

test("API Idempotency-Key replays the same upload and rejects conflicting reuse", async ({
  page,
  context,
}) => {
  await login(page);
  const created = await adminJson(page, "/api/admin/api-keys", "POST", {
    name: "Playwright",
  });
  expect(created.status).toBe(201);
  const token = created.data.token;
  expect(token).toMatch(/^pvk_[0-9a-f]{64}$/);

  const upload = (body) =>
    context.request.post(`${ADMIN_URL}/api/admin/items`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": "playwright-upload-1",
      },
      multipart: {
        file: {
          name: "api.html",
          mimeType: "text/html",
          buffer: Buffer.from(body),
        },
        visibility: "public",
        urlExpireDays: "15",
        fileExpireDays: "30",
      },
    });

  const first = await upload("<h1>same</h1>");
  expect(first.status()).toBe(200);
  expect(first.headers()["idempotency-replayed"]).toBe("false");
  const firstBody = await first.json();

  const replay = await upload("<h1>same</h1>");
  expect(replay.status()).toBe(200);
  expect(replay.headers()["idempotency-replayed"]).toBe("true");
  const replayBody = await replay.json();
  expect(replayBody.id).toBe(firstBody.id);

  const conflict = await upload("<h1>different</h1>");
  expect(conflict.status()).toBe(409);
  expect(await conflict.json()).toMatchObject({
    code: "idempotency_conflict",
  });
});


test("admin library filters server-side and restores selected files in batch", async ({
  page,
  context,
}) => {
  await login(page);

  await uploadViaUi(page, {
    name: "admin-filter-html.html",
    mimeType: "text/html",
    buffer: Buffer.from("<h1>html</h1>"),
  });
  const pdf = await uploadViaUi(page, {
    name: "admin-filter-pdf.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nadmin-filter"),
  });

  const disable = await adminJson(
    page,
    `/api/admin/items/${pdf.id}`,
    "PATCH",
    { status: "disabled" },
  );
  expect(disable.status).toBe(200);

  await page.goto(`${ADMIN_URL}/#/items`);
  await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();

  await page.getByLabel("All types").selectOption("pdf");
  await page.getByLabel("Created").selectOption("7");
  await page.getByLabel("Expiry").selectOption("url-30");
  await page.getByLabel("File size").selectOption("small");
  await page.getByLabel("All status").selectOption("disabled");
  await page
    .getByPlaceholder("Search title, filename, or URL")
    .fill("admin-filter-pdf");

  await expect(page.getByText("admin-filter-pdf.pdf").first()).toBeVisible();
  await expect(page.getByText("admin-filter-html.html")).toHaveCount(0);

  const menuButton = page.locator('button[aria-label="More actions"]:visible').first();
  await menuButton.click();
  const rawLink = page.getByRole("menuitem", { name: "Open raw file" });
  await expect(rawLink).toHaveAttribute(
    "href",
    `${PUBLIC_URL}/raw/${encodeURIComponent(pdf.slug)}`,
  );
  await page.keyboard.press("Escape");

  await page
    .locator('input[aria-label^="Select admin-filter-pdf"]:visible')
    .first()
    .check();
  await page.getByRole("button", { name: "Restore" }).click();

  await page.getByLabel("All status").selectOption("active");
  await expect(page.getByText("admin-filter-pdf.pdf").first()).toBeVisible();
  expect((await context.request.get(pdf.publicUrl)).status()).toBe(200);
});
