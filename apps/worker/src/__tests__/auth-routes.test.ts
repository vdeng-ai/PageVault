import { createHtmlBedConfig, HtmlBedService, HTML_CONTENT_TYPE, pbkdf2Sha256 } from "@htmlbed/core";
import type {
  AuditLogInput,
  CreateItemInput,
  HtmlItem,
  ListItemsInput,
  ListItemsResult,
  MetadataRepository,
  StorageProvider,
  StoredObject,
  UpdateItemInput
} from "@htmlbed/core";
import { describe, expect, it } from "vitest";
import { createRequestHandler } from "../app.js";
import type { AppBindings } from "../bindings.js";

class MemoryStorage implements StorageProvider {
  async putObject(_key: string, _body: ArrayBuffer, _contentType: string): Promise<void> {}
  async getObject(_key: string): Promise<StoredObject | null> {
    return { body: new ArrayBuffer(0), contentType: HTML_CONTENT_TYPE };
  }
  async deleteObject(_key: string): Promise<void> {}
}

class MemoryRepository implements MetadataRepository {
  async createItem(input: CreateItemInput): Promise<HtmlItem> {
    return input.item;
  }
  async getItemById(_id: string): Promise<HtmlItem | null> {
    return null;
  }
  async getItemBySlug(_slug: string): Promise<HtmlItem | null> {
    return null;
  }
  async listItems(input: ListItemsInput): Promise<ListItemsResult> {
    return { items: [], page: input.page, pageSize: input.pageSize, total: 0 };
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
  const passwordHash = await pbkdf2Sha256("secret", 100000, "00112233445566778899aabbccddeeff");
  const env: AppBindings = {
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_PASSWORD_HASH: passwordHash,
    SESSION_SECRET: "test-session-secret",
    APP_ENV: "production",
    ADMIN_BASE_URL: "https://admin.test",
    PUBLIC_BASE_URL: "https://public.test"
  };
  const service = new HtmlBedService(
    new MemoryRepository(),
    new MemoryStorage(),
    createHtmlBedConfig({ publicBaseUrl: "https://public.test" })
  );
  const handle = createRequestHandler({
    createService: () => service,
    fetchAsset: async () => new Response("<div id=\"root\"></div>", { headers: { "Content-Type": "text/html" } })
  });
  return { env, handle };
}

describe("admin auth routes", () => {
  it("returns 401 for unauthenticated admin API requests", async () => {
    const { env, handle } = await createFixture();
    const response = await handle(new Request("https://admin.test/api/admin/items"), env);
    expect(response.status).toBe(401);
  });

  it("allows access after login", async () => {
    const { env, handle } = await createFixture();
    const login = await handle(
      new Request("https://admin.test/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@example.com", password: "secret" })
      }),
      env
    );
    expect(login.status).toBe(200);
    const cookie = login.headers.get("Set-Cookie");
    expect(cookie).toContain("htmlbed_session=");

    const me = await handle(
      new Request("https://admin.test/api/auth/me", {
        headers: { Cookie: cookie ?? "" }
      }),
      env
    );
    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toMatchObject({ authenticated: true });

    const items = await handle(
      new Request("https://admin.test/api/admin/items", {
        headers: { Cookie: cookie ?? "" }
      }),
      env
    );
    expect(items.status).toBe(200);
  });

  it("returns 403 for write operations without CSRF", async () => {
    const { env, handle } = await createFixture();
    const login = await handle(
      new Request("https://admin.test/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@example.com", password: "secret" })
      }),
      env
    );
    const cookie = login.headers.get("Set-Cookie") ?? "";
    const response = await handle(
      new Request("https://admin.test/api/admin/items/batch", {
        method: "POST",
        headers: { Cookie: cookie }
      }),
      env
    );
    expect(response.status).toBe(403);
  });
});
