import {
  createHtmlBedConfig,
  HtmlBedService,
  HTML_CONTENT_TYPE,
  pbkdf2Sha256,
} from "@htmlbed/core";
import { addDays } from "@htmlbed/core";
import type {
  AuditLogInput,
  CreateItemInput,
  DashboardStats,
  HtmlItem,
  ListItemsInput,
  ListItemsResult,
  MetadataRepository,
  StorageProvider,
  StoredObject,
  UpdateItemInput,
} from "@htmlbed/core";
import { describe, expect, it } from "vitest";
import { createRequestHandler } from "../app.js";
import type { AppBindings } from "../bindings.js";

class MemoryStorage implements StorageProvider {
  readonly objects = new Map<string, StoredObject>();

  async putObject(
    key: string,
    body: ArrayBuffer,
    contentType: string,
  ): Promise<void> {
    this.objects.set(key, { body, contentType, size: body.byteLength });
  }
  async getObject(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }
  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

class MemoryRepository implements MetadataRepository {
  readonly items = new Map<string, HtmlItem>();

  async createItem(input: CreateItemInput): Promise<HtmlItem> {
    this.items.set(input.item.id, input.item);
    return input.item;
  }
  async getItemById(id: string): Promise<HtmlItem | null> {
    return this.items.get(id) ?? null;
  }
  async getItemBySlug(slug: string): Promise<HtmlItem | null> {
    return (
      Array.from(this.items.values()).find((item) => item.slug === slug) ?? null
    );
  }
  async listItems(input: ListItemsInput): Promise<ListItemsResult> {
    return { items: [], page: input.page, pageSize: input.pageSize, total: 0 };
  }
  async getDashboardStats(
    _now: string,
    _soon: string,
  ): Promise<DashboardStats> {
    return {
      total: 0,
      publicCount: 0,
      urlExpired: 0,
      fileDeletingSoon: 0,
      deleted: 0,
    };
  }
  async updateItem(_id: string, _patch: UpdateItemInput): Promise<HtmlItem> {
    throw new Error("not implemented");
  }
  async markDeleted(_id: string, _deletedAt: string): Promise<void> {}
  async incrementAccess(_id: string, _accessedAt: string): Promise<void> {}
  async findExpiredFiles(_now: string, _limit: number): Promise<HtmlItem[]> {
    return [];
  }
  async writeAuditLog(_input: AuditLogInput): Promise<void> {}
}

async function createFixture() {
  const passwordHash = await pbkdf2Sha256(
    "secret",
    100000,
    "00112233445566778899aabbccddeeff",
  );
  const env: AppBindings = {
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_PASSWORD_HASH: passwordHash,
    SESSION_SECRET: "test-session-secret",
    APP_ENV: "production",
    ADMIN_BASE_URL: "https://admin.test",
    PUBLIC_BASE_URL: "https://public.test",
  };
  const repo = new MemoryRepository();
  const storage = new MemoryStorage();
  const service = new HtmlBedService(
    repo,
    storage,
    createHtmlBedConfig({ publicBaseUrl: "https://public.test" }),
  );
  const handle = createRequestHandler({
    createService: () => service,
    fetchAsset: async () =>
      new Response('<div id="root"></div>', {
        headers: { "Content-Type": "text/html" },
      }),
  });
  return { env, handle, repo, storage };
}

function item(overrides: Partial<HtmlItem> = {}): HtmlItem {
  const now = new Date("2026-07-05T00:00:00.000Z");
  return {
    id: overrides.id ?? "item-1",
    title: "Product",
    originalFilename: "product.html",
    slug: overrides.slug ?? "product-a1b2c3d4",
    objectKey: overrides.objectKey ?? "objects/item-1/index.html",
    contentType: HTML_CONTENT_TYPE,
    sizeBytes: 12,
    sha256: "hash",
    visibility: overrides.visibility ?? "public",
    status: overrides.status ?? "active",
    urlExpiresAt: overrides.urlExpiresAt ?? addDays(now, 7).toISOString(),
    fileExpiresAt: overrides.fileExpiresAt ?? addDays(now, 180).toISOString(),
    accessCount: 0,
    lastAccessedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    deletedAt: null,
    ...overrides,
  };
}

describe("admin auth routes", () => {
  it("returns 401 for unauthenticated admin API requests", async () => {
    const { env, handle } = await createFixture();
    const response = await handle(
      new Request("https://admin.test/api/admin/items"),
      env,
    );
    expect(response.status).toBe(401);
  });

  it("keeps the production admin domain behind authentication", async () => {
    const { env, handle } = await createFixture();
    const productionEnv = {
      ...env,
      ADMIN_BASE_URL: "https://admin-html.vdengai.com",
      PUBLIC_BASE_URL: "https://h.vdengai.com",
    };

    const response = await handle(
      new Request("https://admin-html.vdengai.com/api/admin/items"),
      productionEnv,
    );
    expect(response.status).toBe(401);
  });

  it("allows access after login", async () => {
    const { env, handle } = await createFixture();
    const login = await handle(
      new Request("https://admin.test/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "secret",
        }),
      }),
      env,
    );
    expect(login.status).toBe(200);
    const cookie = login.headers.get("Set-Cookie");
    expect(cookie).toContain("htmlbed_session=");

    const me = await handle(
      new Request("https://admin.test/api/auth/me", {
        headers: { Cookie: cookie ?? "" },
      }),
      env,
    );
    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toMatchObject({ authenticated: true });

    const items = await handle(
      new Request("https://admin.test/api/admin/items", {
        headers: { Cookie: cookie ?? "" },
      }),
      env,
    );
    expect(items.status).toBe(200);
  });

  it("returns 401 for incorrect credentials", async () => {
    const { env, handle } = await createFixture();
    const response = await handle(
      new Request("https://admin.test/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@example.com", password: "wrong" }),
      }),
      env,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid credentials",
    });
  });

  it("returns a controlled error when auth configuration is missing", async () => {
    const { env, handle } = await createFixture();
    const response = await handle(
      new Request("https://admin.test/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "secret",
        }),
      }),
      { ...env, ADMIN_PASSWORD_HASH: undefined as unknown as string },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Authentication is not configured",
      code: "auth_config_missing",
    });
  });

  it("returns a controlled error when the password hash is invalid", async () => {
    const { env, handle } = await createFixture();
    const unsupportedHash = [
      "pbkdf2_sha256",
      "310000",
      "00112233445566778899aabbccddeeff",
      "0".repeat(64),
    ].join("$");
    const response = await handle(
      new Request("https://admin.test/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "secret",
        }),
      }),
      { ...env, ADMIN_PASSWORD_HASH: unsupportedHash },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Authentication password hash is invalid",
      code: "auth_config_invalid",
    });
  });

  it("returns 403 for write operations without CSRF", async () => {
    const { env, handle } = await createFixture();
    const login = await handle(
      new Request("https://admin.test/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "secret",
        }),
      }),
      env,
    );
    const cookie = login.headers.get("Set-Cookie") ?? "";
    const response = await handle(
      new Request("https://admin.test/api/admin/items/batch", {
        method: "POST",
        headers: { Cookie: cookie },
      }),
      env,
    );
    expect(response.status).toBe(403);
  });
});

describe("public routes", () => {
  it("serves active HTML on public slug variants", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const active = item();
    await repo.createItem({ item: active });
    await storage.putObject(
      active.objectKey,
      new TextEncoder().encode("<h1>ok</h1>").buffer,
      HTML_CONTENT_TYPE,
    );

    const plain = await handle(
      new Request("https://public.test/p/product-a1b2c3d4"),
      env,
    );
    expect(plain.status).toBe(200);
    await expect(plain.text()).resolves.toBe("<h1>ok</h1>");

    const withSlash = await handle(
      new Request("https://public.test/p/product-a1b2c3d4/"),
      env,
    );
    expect(withSlash.status).toBe(200);

    const withHtml = await handle(
      new Request("https://public.test/p/product-a1b2c3d4.html"),
      env,
    );
    expect(withHtml.status).toBe(200);

    const head = await handle(
      new Request("https://public.test/p/product-a1b2c3d4", { method: "HEAD" }),
      env,
    );
    expect(head.status).toBe(200);
    await expect(head.text()).resolves.toBe("");
  });

  it("serves production public URLs without admin credentials", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const productionEnv = {
      ...env,
      ADMIN_BASE_URL: "https://admin-html.vdengai.com",
      PUBLIC_BASE_URL: "https://h.vdengai.com",
    };
    const active = item({
      slug: "html-ed559a5f",
      objectKey: "objects/html-ed559a5f/index.html",
    });
    await repo.createItem({ item: active });
    await storage.putObject(
      active.objectKey,
      new TextEncoder().encode("<h1>public</h1>").buffer,
      HTML_CONTENT_TYPE,
    );

    const response = await handle(
      new Request("https://h.vdengai.com/p/html-ed559a5f"),
      productionEnv,
    );
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("<h1>public</h1>");
  });

  it("keeps public host enumeration and API paths hidden", async () => {
    const { env, handle } = await createFixture();
    await expect(
      handle(new Request("https://public.test/"), env),
    ).resolves.toMatchObject({
      status: 404,
    });
    await expect(
      handle(new Request("https://public.test/api/admin/items"), env),
    ).resolves.toMatchObject({
      status: 404,
    });
    await expect(
      handle(new Request("https://public.test/assets/index.js"), env),
    ).resolves.toMatchObject({
      status: 404,
    });
    await expect(
      handle(
        new Request("https://public.test/api/admin/items", {
          headers: { "Sec-Fetch-Mode": "navigate" },
        }),
        env,
      ),
    ).resolves.toMatchObject({
      status: 404,
    });
    await expect(
      handle(new Request("https://public.test/files"), env),
    ).resolves.toMatchObject({
      status: 404,
    });
  });

  it("returns 404 for malformed encoded slugs", async () => {
    const { env, handle } = await createFixture();
    const response = await handle(
      new Request("https://public.test/p/%E0%A4%A"),
      env,
    );
    expect(response.status).toBe(404);
  });

  it("maps public item states to the planned status codes", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const disabled = item({
      id: "disabled",
      slug: "disabled-a1b2c3d4",
      objectKey: "objects/disabled/index.html",
      status: "disabled",
    });
    const privateItem = item({
      id: "private",
      slug: "private-a1b2c3d4",
      objectKey: "objects/private/index.html",
      visibility: "private",
    });
    const expired = item({
      id: "expired",
      slug: "expired-a1b2c3d4",
      objectKey: "objects/expired/index.html",
      urlExpiresAt: "2026-01-01T00:00:00.000Z",
    });
    await repo.createItem({ item: disabled });
    await repo.createItem({ item: privateItem });
    await repo.createItem({ item: expired });
    await storage.putObject(
      disabled.objectKey,
      new ArrayBuffer(1),
      HTML_CONTENT_TYPE,
    );
    await storage.putObject(
      privateItem.objectKey,
      new ArrayBuffer(1),
      HTML_CONTENT_TYPE,
    );
    await storage.putObject(
      expired.objectKey,
      new ArrayBuffer(1),
      HTML_CONTENT_TYPE,
    );

    await expect(
      handle(new Request("https://public.test/p/disabled-a1b2c3d4"), env),
    ).resolves.toMatchObject({
      status: 403,
    });
    await expect(
      handle(new Request("https://public.test/p/private-a1b2c3d4"), env),
    ).resolves.toMatchObject({
      status: 404,
    });
    await expect(
      handle(new Request("https://public.test/p/expired-a1b2c3d4"), env),
    ).resolves.toMatchObject({
      status: 410,
    });
  });
});
