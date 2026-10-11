import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const ADMIN_URL = "http://localhost:3100";
const run = promisify(execFile);

for (const { language, theme, width, height } of [
  { language: "en", theme: "light", width: 1280, height: 900 },
  { language: "zh-CN", theme: "dark", width: 390, height: 844 },
]) {
  test(`API usage instructions and AI copy at ${width}px in ${language}`, async ({
    page,
    context,
    request,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning")
        errors.push(message.text());
    });
    await page.setViewportSize({ width, height });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: ADMIN_URL,
    });
    await page.addInitScript(
      ({ language, theme }) => {
        localStorage.setItem("pagevault.admin.language", language);
        localStorage.setItem("pagevault.admin.theme", theme);
      },
      { language, theme },
    );
    const zh = language === "zh-CN";
    await page.goto(ADMIN_URL);
    await page.locator('input[type="email"]').fill("e2e@example.com");
    await page.locator('input[type="password"]').fill("pagevault-e2e");
    await page.locator('button[type="submit"]').click();
    await expect(
      page.getByRole("heading", {
        name: zh ? "确认内容，再发布" : "Upload",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto(`${ADMIN_URL}/#/api-keys`);
    await expect(page).toHaveURL(`${ADMIN_URL}/#/api-keys`);
    await expect(page).toHaveTitle("PageVault Admin");
    await expect(
      page.getByRole("heading", {
        name: zh ? "API 密钥" : "API Keys",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);

    const guide = page.locator(".api-usage-guide");
    await expect(guide).not.toHaveAttribute("open", "");
    await guide.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(guide).toHaveAttribute("open", "");
    const example = await guide
      .getByLabel(zh ? "cURL 上传示例" : "cURL upload example")
      .textContent();
    expect(example).toContain(`ADMIN_BASE_URL="${ADMIN_URL}"`);
    expect(example).toContain("$PAGEVAULT_API_KEY");
    await guide
      .getByRole("button", {
        name: zh ? "复制 cURL 示例" : "Copy cURL example",
      })
      .click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(example);
    await expect(
      guide.getByRole("button", { name: zh ? "示例已复制" : "Example copied" }),
    ).toBeVisible();
    await guide
      .getByRole("button", {
        name: zh ? "复制 AI 接入说明" : "Copy AI integration guide",
      })
      .click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    await expect(
      guide.getByRole("button", {
        name: zh ? "AI 说明已复制" : "AI guide copied",
      }),
    ).toBeVisible();

    const doc = await request.get(`${ADMIN_URL}/upload-api.md`);
    expect(doc.status()).toBe(200);
    expect(doc.headers()["content-type"]).toBe("text/markdown; charset=utf-8");
    expect(doc.headers()["cache-control"]).toContain("must-revalidate");
    expect(copied).toBe(
      (await doc.text()).replaceAll("https://YOUR_ADMIN_HOST", ADMIN_URL),
    );
    expect(copied).toContain("idempotency_in_progress");
    expect(copied).not.toMatch(/pvk_[a-f0-9]{64}/);

    // Execute the displayed example, including a retry, with a real upload key.
    if (!zh) {
      const { csrfToken } = await (
        await context.request.get(`${ADMIN_URL}/api/auth/me`)
      ).json();
      const created = await context.request.post(
        `${ADMIN_URL}/api/admin/api-keys`,
        {
          headers: { "X-CSRF-Token": csrfToken },
          data: { name: "Guide cURL verification" },
        },
      );
      expect(created.ok()).toBe(true);
      const { apiKey, token } = await created.json();
      expect(copied.includes(token)).toBe(false);
      const directory = await mkdtemp(join(tmpdir(), "pagevault-guide-"));
      const original =
        "<!doctype html><html><title>Guide example</title><body>Original bytes</body></html>";
      try {
        await writeFile(join(directory, "report.html"), original);
        const options = {
          cwd: directory,
          env: { ...process.env, PAGEVAULT_API_KEY: token },
          timeout: 10000,
        };
        const result = JSON.parse(
          (await run("bash", ["-c", example], options)).stdout,
        );
        const replay = JSON.parse(
          (await run("bash", ["-c", example], options)).stdout,
        );
        expect(replay.id).toBe(result.id);
        expect(result.publicUrl).toMatch(/^http:\/\/127\.0\.0\.1:3100\/p\//);
        const viewer = await request.get(result.publicUrl);
        expect(viewer.status()).toBe(200);
        const raw = await request.get(result.publicUrl.replace("/p/", "/raw/"));
        expect(raw.status()).toBe(200);
        expect(await raw.text()).toBe(original);
      } finally {
        await rm(directory, { recursive: true, force: true });
        await context.request.delete(
          `${ADMIN_URL}/api/admin/api-keys/${apiKey.id}`,
          {
            headers: { "X-CSRF-Token": csrfToken },
          },
        );
      }
    }

    const llms = await request.get(`${ADMIN_URL}/llms.txt`);
    expect(llms.status()).toBe(200);
    expect(llms.headers()["content-type"]).toBe("text/plain; charset=utf-8");
    expect(llms.headers()["x-content-type-options"]).toBe("nosniff");
    expect(await llms.text()).toContain("[Upload API guide](/upload-api.md)");
    const head = await request.head(`${ADMIN_URL}/llms.txt`);
    expect(head.status()).toBe(200);
    expect(await head.body()).toHaveLength(0);
    for (const path of ["/llms.txt", "/upload-api.md"]) {
      expect((await request.get(`http://127.0.0.1:3100${path}`)).status()).toBe(
        404,
      );
    }
    const popupPromise = page.waitForEvent("popup");
    await guide
      .getByRole("link", { name: zh ? "打开 llms.txt" : "Open llms.txt" })
      .click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    await expect(popup).toHaveURL(`${ADMIN_URL}/llms.txt`);
    expect(await popup.locator("body").innerText()).toContain("# PageVault");
    await popup.close();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await guide
      .locator("summary")
      .evaluate((element) => element.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: `/tmp/pagevault-api-usage-${width}.png` });
    expect(errors).toEqual([]);
  });
}
