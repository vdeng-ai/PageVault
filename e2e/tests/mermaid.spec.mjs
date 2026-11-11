import { expect, test } from "@playwright/test";

const ADMIN_URL = "http://localhost:3100";

async function login(page) {
  await page.goto(ADMIN_URL);
  await page.locator('input[type="email"]').fill("e2e@example.com");
  await page.locator('input[type="password"]').fill("pagevault-e2e");
  await page.locator('button[type="submit"]').click();
  await expect(
    page.getByRole("heading", { name: "Upload", exact: true }),
  ).toBeVisible();
}

async function selectMarkdown(page, source) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "diagrams.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(source),
  });
  return page.frameLocator('iframe[title="Content preview"]');
}

async function publish(page, visibility = "public") {
  await page.locator(`input[name="visibility"][value="${visibility}"]`).check();
  const uploaded = page.waitForResponse(
    (response) =>
      response.url() === `${ADMIN_URL}/api/admin/items` &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Upload and publish", exact: true })
    .click();
  const response = await uploaded;
  expect(response.status()).toBe(200);
  return response.json();
}

const source = `# Diagram notes

~~~mermaid
flowchart LR
  A[Upload] --> B[Share]
~~~

~~~mermaid
sequenceDiagram
  Alice->>Bob: Hello
  Bob-->>Alice: Ready
~~~

~~~js
const original = true;
~~~
`;

test("Mermaid renders in upload and public readers, follows themes, and preserves raw bytes", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  const preview = await selectMarkdown(page, source);
  await expect(preview.locator("pre.markdown-diagram svg")).toHaveCount(2);
  await expect(preview.locator("pre.markdown-diagram").first()).toContainText(
    "Upload",
  );
  await expect(page.locator('iframe[title="Content preview"]')).toHaveAttribute(
    "sandbox",
    "",
  );
  const result = await publish(page);
  await page.goto(result.publicUrl);
  await expect(page).toHaveTitle("Diagram notes");
  await expect(page.locator("pre.markdown-diagram svg")).toHaveCount(2);
  await expect(page.locator('pre[data-diagram-theme="dark"]')).toHaveCount(2);
  await expect(page.locator("code.language-js")).toHaveText(
    "const original = true;\n",
  );
  await page.locator(".share-tools summary").click();
  await page.locator("[data-theme-toggle]").click();
  await expect(page.locator('pre[data-diagram-theme="light"]')).toHaveCount(2);
  await expect(page.locator("pre.markdown-diagram svg")).toHaveCount(2);
  await page.locator(".share-tools summary").click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await expect(page.locator("pre.markdown-diagram").first()).toBeVisible();
  const raw = await context.request.get(
    new URL(`/raw/${encodeURIComponent(result.slug)}`, result.publicUrl).href,
  );
  expect(await raw.text()).toBe(source);
  const script = await context.request.head(
    new URL("/assets/markdown-diagrams.js", result.publicUrl).href,
  );
  expect(script.status()).toBe(200);
  expect(script.headers()["content-type"]).toContain("javascript");
  expect(script.headers()["cache-control"]).toContain("must-revalidate");
  expect(errors).toEqual([]);
});

test("private Markdown renders Mermaid inside its opaque authenticated sandbox", async ({
  page,
  context,
}) => {
  await login(page);
  await selectMarkdown(page, source);
  const result = await publish(page, "private");
  const url = `${ADMIN_URL}/api/admin/items/${result.id}/preview`;
  const response = await context.request.get(url);
  expect(response.headers()["content-security-policy"]).toBe(
    "sandbox allow-scripts; frame-ancestors 'self'",
  );
  expect(response.headers()["cache-control"]).toBe("no-store");
  await page.goto(url);
  await expect(page.locator("pre.markdown-diagram svg")).toHaveCount(2);
  expect(await page.evaluate(() => window.origin)).toBe("null");
  expect((await context.request.get(result.publicUrl)).status()).toBe(404);
});

test("ordinary Markdown stays lightweight and invalid or unsafe diagrams keep the reader usable", async ({
  page,
}) => {
  const assets = [];
  page.on("request", (request) => {
    if (request.url().includes("/assets/")) assets.push(request.url());
  });
  await login(page);
  assets.length = 0;
  const plain = await selectMarkdown(
    page,
    "# Plain notes\n\nNo diagrams here.",
  );
  await expect(plain.locator("h1")).toHaveText("Plain notes");
  expect(assets).toEqual([]);
  const result = await publish(page);
  assets.length = 0;
  await page.goto(result.publicUrl);
  await expect(page.locator(".markdown-body h1")).toHaveText("Plain notes");
  expect(assets).toEqual([]);

  await page.goto(`${ADMIN_URL}/#/`);
  const unsafe = `# Diagram safety

~~~mermaid
this is not a valid diagram
~~~

~~~mermaid
---
config:
  securityLevel: loose
  htmlLabels: true
---
flowchart LR
  A["<img src=x onerror=alert(1)>"] --> B[Safe]
  click B "javascript:alert(1)"
~~~

Still readable.
`;
  const preview = await selectMarkdown(page, unsafe);
  await expect(preview.locator("pre[data-diagram-error] code")).toBeVisible();
  await expect(preview.locator("pre.markdown-diagram svg")).toHaveCount(1);
  const safety = await publish(page);
  await page.goto(safety.publicUrl);
  await expect(page.locator("pre[data-diagram-error] code")).toBeVisible();
  await expect(page.locator("pre.markdown-diagram svg")).toHaveCount(1);
  await expect(
    page.locator(
      "pre.markdown-diagram svg img, pre.markdown-diagram svg script, pre.markdown-diagram svg foreignObject",
    ),
  ).toHaveCount(0);
  expect(
    await page
      .locator("pre.markdown-diagram svg a")
      .evaluateAll((nodes) =>
        nodes.every(
          (node) =>
            !node.hasAttribute("href") && !node.hasAttribute("xlink:href"),
        ),
      ),
  ).toBe(true);
  await expect(
    page.getByText("Still readable.", { exact: true }),
  ).toBeVisible();
});
