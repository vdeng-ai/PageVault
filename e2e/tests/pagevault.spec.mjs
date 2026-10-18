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
  { name, mimeType, buffer, visibility = "public" },
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
        body:
          requestBody === undefined ? undefined : JSON.stringify(requestBody),
      });
      const data = await response.json().catch(() => ({}));
      return { status: response.status, data };
    },
    { path, method, body },
  );
}

test("dashboard keeps statistics available when operations returns 500", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/admin/operations", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Internal server error",
        requestId: "operations-e2e",
      }),
    }),
  );
  const statsResponse = page.waitForResponse(
    `${ADMIN_URL}/api/admin/dashboard`,
  );
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  expect((await statsResponse).status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Operations", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Internal server error");
  await expect(page.locator(".dashboard-metric-card .skeleton")).toHaveCount(0);
  await expect(page.locator(".dashboard-metric-card")).toHaveCount(6);
});

test("operations returns an empty maintenance history on a migrated database", async ({
  page,
  context,
}) => {
  await login(page);
  const response = await context.request.get(
    `${ADMIN_URL}/api/admin/operations`,
  );
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    lastMaintenanceAt: null,
    lastMaintenanceStatus: null,
    lastMaintenanceSummary: null,
    recentAuditEvents: expect.any(Array),
  });
});

test("HTML UI upload keeps share/raw behavior and works on a mobile viewport", async ({
  page,
  context,
}) => {
  await login(page);
  const source =
    "<!doctype html><html><head><title>中文测试</title><meta name=description content=普通描述><meta property=og:description content=自动提取的分享摘要></head><body><h1>你好 PageVault</h1></body></html>";
  const uploaded = await uploadViaUi(page, {
    name: "产品介绍.html",
    mimeType: "text/html",
    buffer: Buffer.from(source),
  });

  expect(uploaded.publicUrl).toContain(`${PUBLIC_URL}/p/`);
  expect(uploaded.title).toBe("中文测试");
  const details = await context.request.get(
    `${ADMIN_URL}/api/admin/items/${uploaded.id}`,
  );
  expect((await details.json()).shareDescription).toBe("自动提取的分享摘要");
  const rawUrl = `${PUBLIC_URL}/raw/${encodeURIComponent(uploaded.slug)}`;

  const share = await context.request.get(uploaded.publicUrl);
  expect(share.status()).toBe(200);
  expect(share.headers()["content-type"]).toContain("text/html");
  const shareHtml = await share.text();
  expect(shareHtml).toContain("中文测试");
  expect(shareHtml).toContain(
    '<meta property="og:description" content="自动提取的分享摘要">',
  );
  expect(shareHtml).toContain(rawUrl);

  const raw = await context.request.get(rawUrl);
  expect(raw.status()).toBe(200);
  expect(await raw.text()).toBe(source);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(uploaded.publicUrl);
  await expect(page).toHaveTitle("中文测试");
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    "content",
    "自动提取的分享摘要",
  );
  await expect(page.locator(".share-immersive")).toBeVisible();
  await expect(page.locator("[data-share-tools]")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(page.locator(".share-viewer-frame")).toBeVisible();
  await page.locator(".share-tools summary").click();
  await expect(page.locator(".share-tools-title")).toContainText("中文测试");
  await expect(page.getByRole("button", { name: "复制链接" })).toBeVisible();
  await expect(page.getByRole("button", { name: "全屏查看" })).toBeVisible();
  await expect(page.getByRole("link", { name: "打开原文件" })).toBeVisible();

  await page.goto(ADMIN_URL);
  const edited = await adminJson(
    page,
    `/api/admin/items/${uploaded.id}`,
    "PATCH",
    { title: "手动修改的标题" },
  );
  expect(edited.status).toBe(200);
  await page.goto(uploaded.publicUrl);
  await expect(page).toHaveTitle("手动修改的标题");
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    "content",
    "自动提取的分享摘要",
  );
  expect(await (await context.request.get(rawUrl)).text()).toBe(source);
});

const immersiveSource = `<!doctype html><html><head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${"VeryLongDocumentTitle".repeat(10)}</title>
  <style>body{margin:0;background:#faf8f2;color:#20242a;font:18px system-ui}nav{position:fixed;top:0;left:0;padding:16px;background:#e8eddf}main{padding:100px 24px 24px}#space{height:2200px}button{font:inherit;padding:12px}</style>
  </head><body><nav>Original fixed navigation</nav><main><h1>Original HTML</h1>
  <button id="counter">Count: 0</button><div id="space"></div><p id="end">End of document</p></main>
  <script>
  window.loadToken=Math.random();
  document.querySelector('#counter').addEventListener('click',function(){this.textContent='Count: 1';});
  try{window.parent.document.body;document.body.dataset.parentAccess='allowed';}catch(_){document.body.dataset.parentAccess='blocked';}
  try{localStorage.getItem('test');document.body.dataset.storageAccess='allowed';}catch(_){document.body.dataset.storageAccess='blocked';}
  </script></body></html>`;

async function publishImmersive(page) {
  await login(page);
  return uploadViaUi(page, {
    name: "immersive.html",
    mimeType: "text/html",
    buffer: Buffer.from(immersiveSource),
  });
}

test("immersive HTML fills desktop and mobile viewports without moving or reloading content", async ({
  page,
  context,
}) => {
  const uploaded = await publishImmersive(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  let rawRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/raw/")) rawRequests++;
  });
  await page.goto(uploaded.publicUrl);
  const frame = page.frameLocator(".share-viewer-frame");
  await expect(frame.locator("body")).toHaveAttribute(
    "data-parent-access",
    "blocked",
  );
  await expect(frame.locator("body")).toHaveAttribute(
    "data-storage-access",
    "blocked",
  );
  await frame.getByRole("button", { name: "Count: 0" }).click();
  await expect(frame.getByRole("button", { name: "Count: 1" })).toBeVisible();
  const loadToken = await frame
    .locator("body")
    .evaluate(() => window.loadToken);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 260, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    const iframe = page.locator(".share-viewer-frame");
    await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
    await expect
      .poll(() => iframe.boundingBox())
      .toEqual({ x: 0, y: 0, ...viewport });
    expect(
      await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      })),
    ).toEqual(viewport);
    await expect(
      page.locator(".public-header, .share-viewer-meta, .share-viewer-footer"),
    ).toHaveCount(0);
    await frame.locator("#end").scrollIntoViewIfNeeded();
    await expect(frame.locator("#end")).toBeInViewport();
    expect(await frame.locator("nav").boundingBox()).toMatchObject({ y: 0 });
    const scrollBefore = await frame.locator("body").evaluate(() => scrollY);
    const summary = page.locator(".share-tools summary");
    await expect(summary).toHaveCSS("min-height", "44px");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".share-tools")).toHaveAttribute("open", "");
    const panel = await page.locator(".share-tools-panel").boundingBox();
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.width).toBeLessThanOrEqual(280);
    expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width);
    expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.height);
    await page.getByRole("button", { name: "复制链接" }).focus();
    await page.keyboard.press("Escape");
    await expect(summary).toBeFocused();
    await expect(page.locator(".share-tools")).not.toHaveAttribute("open", "");
    expect(await iframe.boundingBox()).toEqual({ x: 0, y: 0, ...viewport });
    expect(await frame.locator("body").evaluate(() => scrollY)).toBe(
      scrollBefore,
    );
    expect(await frame.locator("body").evaluate(() => window.loadToken)).toBe(
      loadToken,
    );
  }
  expect(rawRequests).toBe(1);
  const raw = await context.request.get(
    `${PUBLIC_URL}/raw/${encodeURIComponent(uploaded.slug)}`,
  );
  expect(await raw.text()).toBe(immersiveSource);
  await page.locator(".share-tools summary").click();
  await page.reload();
  await expect(page.locator(".share-tools")).not.toHaveAttribute("open", "");
  expect(errors).toEqual([]);
});

test("immersive toolbar copies links, handles failures, and stays reachable in fullscreen", async ({
  page,
  context,
}) => {
  const uploaded = await publishImmersive(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: PUBLIC_URL,
  });
  await page.goto(uploaded.publicUrl);
  const summary = page.locator(".share-tools summary");
  await summary.click();
  await expect(page.getByRole("link", { name: "打开原文件" })).toHaveAttribute(
    "href",
    `${PUBLIC_URL}/raw/${encodeURIComponent(uploaded.slug)}`,
  );
  await page.getByRole("button", { name: "复制链接" }).click();
  await expect(page.locator("[data-share-feedback]")).toHaveText("链接已复制");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    uploaded.publicUrl,
  );
  await page.getByRole("button", { name: "全屏查看" }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.className))
    .toBe("share-immersive");
  await expect(summary).toBeVisible();
  await summary.click();
  await summary.click();

  // Exercise the legacy clipboard fallback while its temporary input must be
  // inside the fullscreen element to receive focus.
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.getByRole("button", { name: "复制链接" }).click();
  await expect(page.locator("[data-share-feedback]")).toHaveText("链接已复制");
  await page.getByRole("button", { name: "退出全屏" }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement))
    .toBeNull();
  await expect(summary).toBeVisible();

  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    }),
  );
  await page.getByRole("button", { name: "复制链接" }).click();
  await expect(page.locator("[data-share-feedback]")).toHaveText(
    "复制失败，请手动复制地址栏链接",
  );
  await summary.click();
  await expect(page.locator(".share-tools")).not.toHaveAttribute("open", "");
});

test("immersive HTML keeps native tools without JavaScript and hides unsupported fullscreen", async ({
  page,
  browser,
}) => {
  const uploaded = await publishImmersive(page);
  await page.addInitScript(() => {
    Object.defineProperty(document, "fullscreenEnabled", { value: false });
  });
  await page.goto(uploaded.publicUrl);
  await page.locator(".share-tools summary").click();
  await expect(page.locator("[data-fullscreen-toggle]")).toBeHidden();
  await expect(page.getByRole("button", { name: "复制链接" })).toBeVisible();

  const noJs = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  try {
    const nativePage = await noJs.newPage();
    await nativePage.goto(uploaded.publicUrl);
    await expect(
      nativePage
        .frameLocator("iframe")
        .getByRole("heading", { name: "Original HTML" }),
    ).toBeVisible();
    await nativePage.locator(".share-tools summary").click();
    await expect(nativePage.locator(".share-tools")).toHaveAttribute(
      "open",
      "",
    );
    await expect(
      nativePage.locator("[data-copy-share], [data-fullscreen-toggle]"),
    ).toHaveCount(2);
    await expect(nativePage.locator("[data-copy-share]")).toBeHidden();
    await expect(nativePage.locator("[data-fullscreen-toggle]")).toBeHidden();
    const popupPromise = nativePage.waitForEvent("popup");
    await nativePage.getByRole("link", { name: "打开原文件" }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(
      `${PUBLIC_URL}/raw/${encodeURIComponent(uploaded.slug)}`,
    );
    await expect(
      popup.getByRole("heading", { name: "Original HTML" }),
    ).toBeVisible();
    await nativePage.locator(".share-tools summary").click();
    await expect(nativePage.locator(".share-tools")).not.toHaveAttribute(
      "open",
      "",
    );
  } finally {
    await noJs.close();
  }
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
  expect(markdownHtml).toContain('<meta property="og:title" content="Notes">');
  expect(markdownHtml).toContain(
    '<meta property="og:description" content="Ready">',
  );

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
    `<meta property="og:image" content="${PUBLIC_URL}/share-card.png">`,
  );
  const svgRaw = await context.request.get(svgRawUrl);
  expect(svgRaw.status()).toBe(200);
  expect(svgRaw.headers()["content-type"]).toContain("image/svg+xml");
  expect(await svgRaw.text()).toBe(svgSource);

  const shareArt = await context.request.get(`${PUBLIC_URL}/share-card.png`);
  expect(shareArt.status()).toBe(200);
  expect(shareArt.headers()["content-type"]).toContain("image/png");
  expect((await shareArt.body()).byteLength).toBeGreaterThan(1000);

  const hiddenAdminAsset = await context.request.get(
    `${PUBLIC_URL}/index.html`,
  );
  expect(hiddenAdminAsset.status()).toBe(404);
});

test("images, PDF, and Markdown open without chrome and keep tools usable", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(60_000);
  await login(page);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
    "base64",
  );
  const files = [
    { name: "image.png", mimeType: "image/png", buffer: png, kind: "image" },
    {
      name: "diagram.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200"><rect width="1800" height="1200" fill="#82b5a0"/></svg>',
      ),
      kind: "image",
    },
    {
      name: "report.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n0123456789abcdef"),
      kind: "pdf",
    },
    {
      name: "reading.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        `# Reading\n\n## First section\n\n${"Readable paragraph.\n\n".repeat(80)}## Last section\n\nEnd of reading.`,
      ),
      kind: "markdown",
    },
  ];
  const publicPage = await context.newPage();
  const errors = [];
  publicPage.on("pageerror", (error) => errors.push(error.message));
  publicPage.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  for (const file of files) {
    const uploaded = await uploadViaUi(page, file);
    const raw = await context.request.get(
      `${PUBLIC_URL}/raw/${encodeURIComponent(uploaded.slug)}`,
    );
    expect(await raw.body()).toEqual(file.buffer);
    await publicPage.goto(uploaded.publicUrl);
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await publicPage.setViewportSize(viewport);
      await expect(
        publicPage.locator(".public-header, .share-viewer-meta, footer"),
      ).toHaveCount(0);
      await expect(publicPage.locator(".share-tools")).not.toHaveAttribute(
        "open",
        "",
      );
      expect(
        await publicPage.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(viewport.width);
      if (file.kind === "markdown") {
        await expect(
          publicPage.getByRole("heading", { name: "Reading", exact: true }),
        ).toBeVisible();
        expect(
          (await publicPage.locator(".markdown-body").boundingBox()).y,
        ).toBeLessThan(200);
        await publicPage
          .getByRole("heading", { name: "Last section" })
          .scrollIntoViewIfNeeded();
        await expect(
          publicPage.getByRole("heading", { name: "Last section" }),
        ).toBeInViewport();
        await publicPage.evaluate(() => scrollTo(0, 0));
      } else {
        await expect
          .poll(() => publicPage.locator(".share-viewer-stage").boundingBox())
          .toEqual({ x: 0, y: 0, ...viewport });
        if (file.kind === "image") {
          expect(
            await publicPage
              .locator("img")
              .evaluate((img) => img.complete && img.naturalWidth > 0),
          ).toBe(true);
        }
      }
      await publicPage.locator(".share-tools summary").click();
      await expect(
        publicPage.getByRole("link", { name: "打开原文件" }),
      ).toBeVisible();
      if (file.kind === "image") {
        await publicPage.getByRole("button", { name: "查看原尺寸" }).click();
        await expect(publicPage.locator("[data-image-stage]")).toHaveAttribute(
          "data-image-fit",
          "original",
        );
        await publicPage.getByRole("button", { name: "适应屏幕" }).click();
        await publicPage.locator("[data-image-background-toggle]").click();
        await expect(publicPage.locator("[data-image-stage]")).toHaveAttribute(
          "data-image-background",
          "light",
        );
        await publicPage.locator("[data-image-background-toggle]").click();
      }
      if (file.kind === "markdown") {
        await publicPage.locator("[data-theme-toggle]").click();
        await expect(publicPage.locator("html")).toHaveAttribute(
          "data-theme",
          "light",
        );
        await publicPage.locator("[data-theme-toggle]").click();
      }
      await publicPage.getByRole("button", { name: "全屏查看" }).click();
      await expect
        .poll(() =>
          publicPage.evaluate(() => document.fullscreenElement?.className),
        )
        .toBe("share-immersive");
      await expect(publicPage.locator(".share-tools summary")).toBeVisible();
      await publicPage.getByRole("button", { name: "退出全屏" }).click();
      await expect
        .poll(() => publicPage.evaluate(() => document.fullscreenElement))
        .toBeNull();
      await publicPage.keyboard.press("Escape");
      await expect(publicPage.locator(".share-tools summary")).toBeFocused();
    }
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    try {
      const nativePage = await noJs.newPage();
      await nativePage.goto(uploaded.publicUrl);
      await nativePage.locator(".share-tools summary").click();
      await expect(
        nativePage.getByRole("link", { name: "打开原文件" }),
      ).toBeVisible();
      await expect(
        nativePage.locator(".share-tools button:visible"),
      ).toHaveCount(0);
      if (file.kind === "markdown")
        await expect(nativePage.locator(".markdown-body")).toBeVisible();
    } finally {
      await noJs.close();
    }
  }
  expect(errors).toEqual([]);
  await publicPage.close();
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

  const disable = await adminJson(page, `/api/admin/items/${pdf.id}`, "PATCH", {
    status: "disabled",
  });
  expect(disable.status).toBe(200);

  await page.goto(`${ADMIN_URL}/#/items`);
  await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();

  await page.getByRole("button", { name: "More filters", exact: true }).click();
  await page.getByLabel("All types").selectOption("pdf");
  await page.getByLabel("Created").selectOption("7");
  await page.getByLabel("Expiry").selectOption("url-30");
  await page.getByLabel("File size").selectOption("small");
  await page.getByLabel("All status").selectOption("disabled");
  await page
    .getByPlaceholder("Search title, filename, or URL")
    .fill("admin-filter-pdf");

  await expect(
    page.getByRole("button", { name: "admin-filter-pdf", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "admin-filter-html", exact: true }),
  ).toHaveCount(0);

  await page
    .locator('input[aria-label^="Select admin-filter-pdf"]:visible')
    .first()
    .check();
  await page
    .locator(".batch-group summary")
    .filter({ hasText: "More" })
    .click();
  await page.getByRole("button", { name: "Restore" }).click();

  await page.getByLabel("All status").selectOption("active");
  await expect(
    page.getByRole("button", { name: "admin-filter-pdf", exact: true }).first(),
  ).toBeVisible();
  expect((await context.request.get(pdf.publicUrl)).status()).toBe(200);
});
