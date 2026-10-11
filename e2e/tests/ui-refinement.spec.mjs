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

async function upload(page, name) {
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "# Read in peace\n\nKeep the focus on your content.\n\n## First section\n\nPublish with confidence.\n\n## Second section\n\nKeep original files intact.\n",
    ),
  });
  const publish = page.getByRole("button", {
    name: "Upload and publish",
    exact: true,
  });
  const action = await publish.boundingBox();
  expect(action.y + action.height).toBeLessThanOrEqual(
    page.viewportSize().height,
  );
  if (page.viewportSize().width < 700) {
    const nav = await page.locator(".mobile-bottom-nav").boundingBox();
    expect(action.y + action.height).toBeLessThan(nav.y);
    await expect(page.locator(".mobile-preview-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await page.locator(".mobile-preview-toggle").click();
    await expect(page.locator(".upload-preview-body iframe")).toBeVisible();
    await page.locator(".mobile-preview-toggle").click();
  }
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/items") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Upload and publish", exact: true })
    .click();
  const result = await (await response).json();
  await expect(
    page.getByRole("heading", { name: "Your file is live" }),
  ).toBeFocused();
  return result;
}

test("desktop publishing, local copy feedback and grouped batch controls", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: ADMIN_URL,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await login(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "desktop-workbench.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Desktop preview\n\nOriginal content."),
  });
  const publish = page.getByRole("button", {
    name: "Upload and publish",
    exact: true,
  });
  const rect = await publish.boundingBox();
  expect(rect.y + rect.height).toBeLessThanOrEqual(720);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/items") && r.request().method() === "POST",
  );
  await publish.click();
  await response;
  await expect(
    page.getByRole("heading", { name: "Your file is live" }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Copy URL", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Copy URL", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Link copied", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    /\/p\/desktop-workbench-/,
  );
  await page.locator('.desktop-top-nav [data-route="items"]').click();
  const title = page.getByRole("button", {
    name: "desktop-workbench",
    exact: true,
  });
  await expect(title).toBeVisible();
  expect(
    (await page.locator(".filter-search").boundingBox()).width,
  ).toBeGreaterThan(240);
  const tableTop = (await page.locator(".item-table-desktop").boundingBox()).y;
  await page.getByRole("checkbox", { name: "Select all", exact: true }).check();
  expect(
    Math.abs(
      (await page.locator(".item-table-desktop").boundingBox()).y - tableTop,
    ),
  ).toBeLessThanOrEqual(4);
  await expect(page.locator(".batch-groups summary")).toHaveCount(3);
  await page
    .locator(".batch-group summary")
    .filter({ hasText: "Extend expiry" })
    .click();
  await expect(
    page.getByRole("button", { name: "URL +15d", exact: true }),
  ).toBeVisible();
  await page.locator(".batch-group[open]").press("Escape");
  await page
    .getByRole("textbox", { name: "Search", exact: true })
    .fill("desktop-workbench");
  await page
    .getByRole("combobox", { name: "All types", exact: true })
    .selectOption("pdf");
  await expect(
    page.getByRole("heading", { name: "No matching files" }),
  ).toBeVisible();
  await page
    .locator(".empty-library")
    .getByRole("button", { name: "Clear filters" })
    .click();
  await expect(title).toBeVisible();
  await expect(page.getByRole("combobox", { name: "All types" })).toHaveValue(
    "",
  );
});

test("unsaved edits survive navigation, browser Back and a cancelled refresh", async ({
  page,
}) => {
  await login(page);
  const result = await upload(page, "navigation-guard.md");
  await page.getByRole("button", { name: "View details" }).click();
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  await title.fill("Unpublished draft");
  await page.locator('.desktop-top-nav [data-route="items"]').click();
  const dialog = page.getByRole("dialog", { name: "Discard unsaved changes?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(title).toHaveValue("Unpublished draft");
  await expect(page).toHaveURL(new RegExp(`/items/${result.id}$`));
  await page.goBack();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(title).toHaveValue("Unpublished draft");
  await expect(page).toHaveURL(new RegExp(`/items/${result.id}$`));
  let unloadSeen = false;
  page.once("dialog", async (nativeDialog) => {
    expect(nativeDialog.type()).toBe("beforeunload");
    unloadSeen = true;
    await nativeDialog.dismiss();
  });
  // Chromium keeps a cancelled reload pending; bound the navigation wait.
  await page.reload({ timeout: 2000 }).catch(() => undefined);
  expect(unloadSeen).toBe(true);
  await expect(title).toHaveValue("Unpublished draft");
  await page.goBack();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Upload", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(title).toHaveValue("navigation-guard");
  await title.fill("Saved title");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/admin/items/${result.id}`) &&
      r.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await saved;
  await expect(page.getByText("Unsaved changes", { exact: true })).toHaveCount(
    0,
  );
  await page.locator('.desktop-top-nav [data-route="items"]').click();
  await expect(
    page.getByRole("heading", { name: "Files", exact: true }),
  ).toBeVisible();
  await expect(dialog).toHaveCount(0);
});

test("mobile publishing keeps the action reachable and reading starts early", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  const result = await upload(page, "mobile-reading.md");
  const publicPage = await context.newPage();
  await publicPage.setViewportSize({ width: 390, height: 844 });
  await publicPage.goto(result.publicUrl);
  await expect(publicPage.locator("[data-reader-toc]")).not.toHaveAttribute(
    "open",
    "",
  );
  expect(
    (await publicPage.locator(".markdown-body").boundingBox()).y,
  ).toBeLessThan(360);
  expect(
    await publicPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await publicPage.locator(".reader-toc summary").click();
  await publicPage
    .getByRole("link", { name: "First section", exact: true })
    .click();
  await expect(publicPage).toHaveURL(/#first-section$/);
  await publicPage.close();
  await page.locator('.mobile-bottom-nav [data-route="items"]').click();
  const card = page
    .locator(".item-card")
    .filter({ hasText: "mobile-reading.md" });
  await expect(card).toBeVisible();
  await expect(card.locator(".item-card-details")).not.toHaveAttribute(
    "open",
    "",
  );
  await card.locator("summary").click();
  await expect(card.getByText("File expiry", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
