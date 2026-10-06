import {
  createPageVaultConfig,
  PageVaultService,
  HTML_CONTENT_TYPE,
  MARKDOWN_CONTENT_TYPE,
  PDF_CONTENT_TYPE,
  PNG_CONTENT_TYPE,
  pbkdf2Sha256,
} from "@pagevault/core";
import { addDays } from "@pagevault/core";
import type {
  AccessCountInput,
  ApiKey,
  AuditLogInput,
  CreateApiKeyInput,
  CreateItemInput,
  DashboardStats,
  HtmlItem,
  ListItemsInput,
  ListItemsResult,
  MetadataRepository,
  StorageProvider,
  StoredObject,
  UpdateItemInput,
} from "@pagevault/core";
import { describe, expect, it } from "vitest";
import {
  flushAccessCounts,
  recordPublicAccess,
  resetAccessCounterForTests,
} from "../access-counter.js";
import { createRequestHandler } from "../app.js";
import type { AppBindings } from "../bindings.js";

class MemoryStorage implements StorageProvider {
  readonly objects = new Map<string, StoredObject>();
  getReads = 0;
  rangeReads = 0;
  nextPutGate: Promise<void> | null = null;
  nextPutStarted: (() => void) | null = null;
  nextPutError: Error | null = null;

  async putObject(
    key: string,
    body: ArrayBuffer,
    contentType: string,
  ): Promise<void> {
    const gate = this.nextPutGate;
    const started = this.nextPutStarted;
    const error = this.nextPutError;
    this.nextPutGate = null;
    this.nextPutStarted = null;
    this.nextPutError = null;
    started?.();
    if (gate) {
      await gate;
    }
    if (error) {
      throw error;
    }
    this.objects.set(key, { body, contentType, size: body.byteLength });
  }
  async headObject(key: string) {
    const object = this.objects.get(key);
    if (!object) return null;
    return { size: object.size, ...(object.contentType ? { contentType: object.contentType } : {}) };
  }

  async getObject(key: string): Promise<StoredObject | null> {
    this.getReads += 1;
    return this.objects.get(key) ?? null;
  }

  async getObjectRange(key: string, offset: number, length: number) {
    this.rangeReads += 1;
    const object = this.objects.get(key);
    if (!object) return null;
    const body =
      object.body instanceof ArrayBuffer
        ? object.body
        : await new Response(object.body).arrayBuffer();
    const actualLength = Math.min(length, Math.max(0, body.byteLength - offset));
    return {
      body: body.slice(offset, offset + actualLength),
      offset,
      length: actualLength,
      totalSize: body.byteLength,
      ...(object.contentType ? { contentType: object.contentType } : {}),
    };
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

class MemoryRepository implements MetadataRepository {
  readonly items = new Map<string, HtmlItem>();
  readonly apiKeys = new Map<string, { apiKey: ApiKey; tokenHash: string }>();
  apiUploadLease: { owner: string; expiresAt: string } | null = null;
  apiUploadLeaseAttempts = 0;
  accessWrites = 0;

  async createApiKey(input: CreateApiKeyInput): Promise<ApiKey> {
    this.apiKeys.set(input.apiKey.id, input);
    return input.apiKey;
  }
  async listApiKeys(): Promise<ApiKey[]> {
    return Array.from(this.apiKeys.values()).map((entry) => entry.apiKey);
  }
  async getActiveApiKeyByHash(tokenHash: string): Promise<ApiKey | null> {
    return (
      Array.from(this.apiKeys.values()).find(
        (entry) =>
          entry.tokenHash === tokenHash && entry.apiKey.revokedAt === null,
      )?.apiKey ?? null
    );
  }
  async updateApiKeyLastUsedAt(id: string, lastUsedAt: string): Promise<void> {
    const entry = this.apiKeys.get(id);
    if (!entry) return;
    this.apiKeys.set(id, {
      ...entry,
      apiKey: { ...entry.apiKey, lastUsedAt },
    });
  }
  async revokeApiKey(id: string, revokedAt: string): Promise<boolean> {
    const entry = this.apiKeys.get(id);
    if (!entry || entry.apiKey.revokedAt) return false;
    this.apiKeys.set(id, {
      ...entry,
      apiKey: { ...entry.apiKey, revokedAt },
    });
    return true;
  }

  async tryAcquireApiUploadLease(
    owner: string,
    expiresAt: string,
    now: string,
  ): Promise<boolean> {
    this.apiUploadLeaseAttempts += 1;
    if (this.apiUploadLease && this.apiUploadLease.expiresAt > now) {
      return false;
    }
    this.apiUploadLease = { owner, expiresAt };
    return true;
  }

  async releaseApiUploadLease(owner: string): Promise<void> {
    if (this.apiUploadLease?.owner === owner) {
      this.apiUploadLease = null;
    }
  }

  async createItem(input: CreateItemInput): Promise<HtmlItem> {
    this.items.set(input.item.id, input.item);
    return input.item;
  }
  async getItemById(id: string): Promise<HtmlItem | null> {
    return this.items.get(id) ?? null;
  }
  async getItemsByIds(ids: string[]): Promise<HtmlItem[]> {
    const requested = new Set(ids);
    return Array.from(this.items.values()).filter((item) =>
      requested.has(item.id),
    );
  }
  async getItemBySlug(slug: string): Promise<HtmlItem | null> {
    return (
      Array.from(this.items.values()).find((item) => item.slug === slug) ?? null
    );
  }
  async listItems(input: ListItemsInput): Promise<ListItemsResult> {
    return {
      items: [],
      page: input.page,
      pageSize: input.pageSize,
      total: input.includeTotal ? 0 : null,
      hasNextPage: false,
    };
  }
  async getDashboardStats(
    _now: string,
    _soon: string,
  ): Promise<DashboardStats> {
    return {
      total: 0,
      totalSizeBytes: 0,
      publicCount: 0,
      urlExpired: 0,
      fileDeletingSoon: 0,
      deleted: 0,
    };
  }
  async updateItem(id: string, patch: UpdateItemInput): Promise<HtmlItem> {
    const current = this.items.get(id);
    if (!current) throw new Error("Item not found");
    const updated = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.items.set(id, updated);
    return updated;
  }
  async markDeleted(id: string, deletedAt: string): Promise<void> {
    const current = this.items.get(id);
    if (current)
      this.items.set(id, { ...current, status: "deleted", deletedAt });
  }
  async incrementAccess(id: string, accessedAt: string): Promise<void> {
    await this.incrementAccessBatch([{ id, count: 1, accessedAt }]);
  }
  async incrementAccessBatch(input: AccessCountInput[]): Promise<void> {
    this.accessWrites += 1;
    for (const entry of input) {
      const item = this.items.get(entry.id);
      if (item) {
        this.items.set(entry.id, {
          ...item,
          accessCount: item.accessCount + entry.count,
          lastAccessedAt: entry.accessedAt,
        });
      }
    }
  }
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
    ACCESS_COUNT_MODE: "off",
  };
  const repo = new MemoryRepository();
  const storage = new MemoryStorage();
  const service = new PageVaultService(
    repo,
    storage,
    createPageVaultConfig({ publicBaseUrl: "https://public.test" }),
  );
  const handle = createRequestHandler({
    createService: () => service,
    fetchAsset: async () =>
      new Response('<div id="root"></div>', {
        headers: { "Content-Type": "text/html" },
      }),
  });
  return { env, handle, repo, service, storage };
}

function item(overrides: Partial<HtmlItem> = {}): HtmlItem {
  const now = new Date();
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

async function adminSession(
  env: AppBindings,
  handle: ReturnType<typeof createRequestHandler>,
): Promise<{ cookie: string; csrfToken: string }> {
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
  const me = await handle(
    new Request("https://admin.test/api/auth/me", {
      headers: { Cookie: cookie },
    }),
    env,
  );
  const currentUser: { csrfToken: string } = await me.json();
  return { cookie, csrfToken: currentUser.csrfToken };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {};
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function apiUploadRequest(token: string, filename: string): Request {
  const form = new FormData();
  form.set("file", new File(["<h1>API</h1>"], filename));
  return new Request("https://admin.test/api/admin/items", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

describe("admin auth routes", () => {
  it("saves, batches, and deletes items without a Worker ExecutionContext in Node", async () => {
    const { env, handle, repo } = await createFixture();
    const savedItem = item();
    repo.items.set(savedItem.id, savedItem);
    const { cookie, csrfToken } = await adminSession(env, handle);
    const headers = {
      Cookie: cookie,
      "X-CSRF-Token": csrfToken,
      "Content-Type": "application/json",
    };
    const updated = await handle(
      new Request(`https://admin.test/api/admin/items/${savedItem.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ visibility: "private" }),
      }),
      env,
    );
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      visibility: "private",
    });
    const batch = await handle(
      new Request("https://admin.test/api/admin/items/batch", {
        method: "POST",
        headers,
        body: JSON.stringify({ ids: [savedItem.id], action: "set_public" }),
      }),
      env,
    );
    expect(batch.status).toBe(200);
    expect(repo.items.get(savedItem.id)?.visibility).toBe("public");
    const deleted = await handle(
      new Request(`https://admin.test/api/admin/items/${savedItem.id}`, {
        method: "DELETE",
        headers,
      }),
      env,
    );
    expect(deleted.status).toBe(200);
    expect(repo.items.get(savedItem.id)?.status).toBe("deleted");
  });

  it("requires an admin session to preview private content, including with an upload API key", async () => {
    const { env, handle, repo, service, storage } = await createFixture();
    const privateItem = item({ visibility: "private" });
    repo.items.set(privateItem.id, privateItem);
    await storage.putObject(
      privateItem.objectKey,
      new TextEncoder().encode("<h1>Private</h1>").buffer,
      HTML_CONTENT_TYPE,
    );
    const key = await service.createApiKey("Upload only");
    for (const headers of [{}, { Authorization: `Bearer ${key.token}` }]) {
      const response = await handle(
        new Request(
          `https://admin.test/api/admin/items/${privateItem.id}/preview`,
          { headers },
        ),
        env,
      );
      expect(response.status).toBe(401);
    }
    expect(storage.getReads).toBe(0);
  });

  it("previews private HTML in an opaque sandbox without making its public URL accessible", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const privateItem = item({ visibility: "private" });
    repo.items.set(privateItem.id, privateItem);
    const html =
      "<h1>Private</h1><script>document.body.dataset.test='works'</script>";
    await storage.putObject(
      privateItem.objectKey,
      new TextEncoder().encode(html).buffer,
      HTML_CONTENT_TYPE,
    );
    const { cookie } = await adminSession(env, handle);
    const preview = await handle(
      new Request(
        `https://admin.test/api/admin/items/${privateItem.id}/preview`,
        { headers: { Cookie: cookie } },
      ),
      env,
    );
    expect(preview.status).toBe(200);
    expect(preview.headers.get("Cache-Control")).toBe("no-store");
    expect(preview.headers.get("Content-Type")).toBe(HTML_CONTENT_TYPE);
    expect(preview.headers.get("Content-Security-Policy")).toBe(
      "sandbox allow-scripts; frame-ancestors 'self'",
    );
    expect(preview.headers.get("Content-Security-Policy")).not.toContain(
      "allow-same-origin",
    );
    expect(await preview.text()).toBe(html);
    const publicResponse = await handle(
      new Request(`https://public.test/p/${privateItem.slug}`, {
        headers: { Cookie: cookie },
      }),
      env,
    );
    expect(publicResponse.status).toBe(404);
  });

  it("renders private Markdown with its anchors for an authenticated preview", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const privateItem = item({
      visibility: "private",
      contentType: MARKDOWN_CONTENT_TYPE,
    });
    repo.items.set(privateItem.id, privateItem);
    await storage.putObject(
      privateItem.objectKey,
      new TextEncoder().encode(
        '# Private\n\n<a id="start"></a>\n## Getting started\n\n<script>unsafe()</script>',
      ).buffer,
      MARKDOWN_CONTENT_TYPE,
    );
    const { cookie } = await adminSession(env, handle);
    const preview = await handle(
      new Request(
        `https://admin.test/api/admin/items/${privateItem.id}/preview`,
        { headers: { Cookie: cookie } },
      ),
      env,
    );
    expect(preview.status).toBe(200);
    expect(preview.headers.get("Content-Type")).toBe(HTML_CONTENT_TYPE);
    const html = await preview.text();
    expect(html).toContain('id="start"');
    expect(html).toContain('href="#start"');
    expect(html).not.toContain("<script>unsafe()");
  });

  it("serves authenticated PDF previews with byte ranges", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const bytes = new TextEncoder().encode("%PDF-1.7\n0123456789abcdef");
    const privateItem = item({
      visibility: "private",
      originalFilename: "private.pdf",
      objectKey: "objects/private/index.pdf",
      contentType: PDF_CONTENT_TYPE,
      sizeBytes: bytes.byteLength,
    });
    repo.items.set(privateItem.id, privateItem);
    await storage.putObject(
      privateItem.objectKey,
      bytes.buffer,
      PDF_CONTENT_TYPE,
    );
    const { cookie } = await adminSession(env, handle);

    const preview = await handle(
      new Request(
        `https://admin.test/api/admin/items/${privateItem.id}/preview`,
        {
          headers: {
            Cookie: cookie,
            Range: "bytes=-4",
          },
        },
      ),
      env,
    );

    expect(preview.status).toBe(206);
    expect(preview.headers.get("Accept-Ranges")).toBe("bytes");
    expect(preview.headers.get("Content-Range")).toBe(
      `bytes ${bytes.byteLength - 4}-${bytes.byteLength - 1}/${bytes.byteLength}`,
    );
    expect(preview.headers.get("Content-Length")).toBe("4");
    expect(preview.headers.get("Content-Type")).toBe(PDF_CONTENT_TYPE);
    expect(await preview.text()).toBe("cdef");
    expect(storage.getReads).toBe(0);
    expect(storage.rangeReads).toBe(1);
  });

  it("does not read deleted or expired files when previewing as an admin", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const { cookie } = await adminSession(env, handle);
    for (const [privateItem, status] of [
      [item({ status: "deleted" }), 404],
      [item({ fileExpiresAt: addDays(new Date(), -1).toISOString() }), 410],
    ] as const) {
      repo.items.set(privateItem.id, privateItem);
      const preview = await handle(
        new Request(
          `https://admin.test/api/admin/items/${privateItem.id}/preview`,
          { headers: { Cookie: cookie } },
        ),
        env,
      );
      expect(preview.status).toBe(status);
    }
    expect(storage.getReads).toBe(0);
  });

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
      ADMIN_BASE_URL: "https://admin-html.example.com",
      PUBLIC_BASE_URL: "https://h.example.com",
    };

    const response = await handle(
      new Request("https://admin-html.example.com/api/admin/items"),
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
    expect(cookie).toContain("pagevault_session=");

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

  it("uses lightweight list pagination unless exact totals are requested", async () => {
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

    const lightweight = await handle(
      new Request("https://admin.test/api/admin/items", {
        headers: { Cookie: cookie },
      }),
      env,
    );
    await expect(lightweight.json()).resolves.toMatchObject({
      total: null,
      hasNextPage: false,
    });

    const exact = await handle(
      new Request("https://admin.test/api/admin/items?includeTotal=true", {
        headers: { Cookie: cookie },
      }),
      env,
    );
    await expect(exact.json()).resolves.toMatchObject({
      total: 0,
      hasNextPage: false,
    });
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

  it("creates, lists, uses, and revokes an upload-only API key", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const { cookie, csrfToken } = await adminSession(env, handle);

    const createResponse = await handle(
      new Request("https://admin.test/api/admin/api-keys", {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ name: "CI uploader" }),
      }),
      env,
    );
    expect(createResponse.status).toBe(201);
    const created: {
      apiKey: ApiKey;
      token: string;
    } = await createResponse.json();
    expect(created.token).toMatch(/^pvk_[0-9a-f]{64}$/);

    const listResponse = await handle(
      new Request("https://admin.test/api/admin/api-keys", {
        headers: { Cookie: cookie },
      }),
      env,
    );
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.text();
    expect(listBody).toContain("CI uploader");
    expect(listBody).not.toContain(created.token);
    expect(listBody).not.toContain("tokenHash");

    const form = new FormData();
    form.set(
      "file",
      new File(["<h1>API</h1>"], "api-upload.html", {
        type: "text/html",
      }),
    );
    form.set("visibility", "private");
    const uploadResponse = await handle(
      new Request("https://admin.test/api/admin/items", {
        method: "POST",
        headers: { Authorization: `Bearer ${created.token}` },
        body: form,
      }),
      env,
    );
    expect(uploadResponse.status).toBe(200);
    expect(repo.items.size).toBe(1);
    expect(storage.objects.size).toBe(1);

    const forbiddenList = await handle(
      new Request("https://admin.test/api/admin/items", {
        headers: { Authorization: `Bearer ${created.token}` },
      }),
      env,
    );
    expect(forbiddenList.status).toBe(401);

    const revokeResponse = await handle(
      new Request(
        `https://admin.test/api/admin/api-keys/${created.apiKey.id}`,
        {
          method: "DELETE",
          headers: { Cookie: cookie, "X-CSRF-Token": csrfToken },
        },
      ),
      env,
    );
    expect(revokeResponse.status).toBe(200);

    const revokedForm = new FormData();
    revokedForm.set("file", new File(["x"], "revoked.html"));
    const revokedUpload = await handle(
      new Request("https://admin.test/api/admin/items", {
        method: "POST",
        headers: { Authorization: `Bearer ${created.token}` },
        body: revokedForm,
      }),
      env,
    );
    expect(revokedUpload.status).toBe(401);
    expect(repo.items.size).toBe(1);
  });

  it("rejects spoofed file extensions before persisting uploads", async () => {
    const { env, handle, repo, service, storage } = await createFixture();
    const created = await service.createApiKey("Validator");

    const form = new FormData();
    form.set(
      "file",
      new File(["<html>not a pdf</html>"], "spoofed.pdf", {
        type: "application/pdf",
      }),
    );
    const response = await handle(
      new Request("https://admin.test/api/admin/items", {
        method: "POST",
        headers: { Authorization: `Bearer ${created.token}` },
        body: form,
      }),
      env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_file_content",
    });
    expect(repo.items.size).toBe(0);
    expect(storage.objects.size).toBe(0);
    expect(repo.apiUploadLease).toBeNull();
  });

  it("rejects concurrent uploads from different API keys and allows the next retry", async () => {
    const { env, handle, service, storage } = await createFixture();
    const firstKey = await service.createApiKey("First uploader");
    const secondKey = await service.createApiKey("Second uploader");
    const putStarted = deferred();
    const releasePut = deferred();
    storage.nextPutStarted = putStarted.resolve;
    storage.nextPutGate = releasePut.promise;

    const firstResponsePromise = handle(
      apiUploadRequest(firstKey.token, "first.html"),
      env,
    );
    await putStarted.promise;

    const busy = await handle(
      apiUploadRequest(secondKey.token, "second.html"),
      env,
    );
    expect(busy.status).toBe(409);
    expect(busy.headers.get("Retry-After")).toBe("5");
    await expect(busy.json()).resolves.toEqual({
      error: "Another API key upload is already in progress",
      code: "api_upload_busy",
    });

    releasePut.resolve();
    expect((await firstResponsePromise).status).toBe(200);
    const retry = await handle(
      apiUploadRequest(secondKey.token, "second-retry.html"),
      env,
    );
    expect(retry.status).toBe(200);
  });

  it("applies the same concurrency limit to repeated use of one API key", async () => {
    const { env, handle, service, storage } = await createFixture();
    const created = await service.createApiKey("Single uploader");
    const putStarted = deferred();
    const releasePut = deferred();
    storage.nextPutStarted = putStarted.resolve;
    storage.nextPutGate = releasePut.promise;

    const firstResponsePromise = handle(
      apiUploadRequest(created.token, "same-first.html"),
      env,
    );
    await putStarted.promise;
    const busy = await handle(
      apiUploadRequest(created.token, "same-second.html"),
      env,
    );

    expect(busy.status).toBe(409);
    expect(busy.headers.get("Retry-After")).toBe("5");
    await expect(busy.json()).resolves.toMatchObject({
      code: "api_upload_busy",
    });
    releasePut.resolve();
    expect((await firstResponsePromise).status).toBe(200);
  });

  it("rejects invalid and revoked keys before attempting to acquire a lease", async () => {
    const { env, handle, repo, service } = await createFixture();
    const revoked = await service.createApiKey("Revoked uploader");
    await service.revokeApiKey(revoked.apiKey.id);

    const unknown = await handle(
      apiUploadRequest(`pvk_${"0".repeat(64)}`, "unknown.html"),
      env,
    );
    const revokedResponse = await handle(
      apiUploadRequest(revoked.token, "revoked.html"),
      env,
    );

    expect(unknown.status).toBe(401);
    expect(revokedResponse.status).toBe(401);
    expect(repo.apiUploadLeaseAttempts).toBe(0);
  });

  it("lets an administrator upload while an API key holds the global lease", async () => {
    const { env, handle, service, storage } = await createFixture();
    const { cookie, csrfToken } = await adminSession(env, handle);
    const created = await service.createApiKey("Held uploader");
    const putStarted = deferred();
    const releasePut = deferred();
    storage.nextPutStarted = putStarted.resolve;
    storage.nextPutGate = releasePut.promise;

    const keyResponsePromise = handle(
      apiUploadRequest(created.token, "held.html"),
      env,
    );
    await putStarted.promise;

    const adminForm = new FormData();
    adminForm.set("file", new File(["admin"], "admin.html"));
    const adminResponse = await handle(
      new Request("https://admin.test/api/admin/items", {
        method: "POST",
        headers: { Cookie: cookie, "X-CSRF-Token": csrfToken },
        body: adminForm,
      }),
      env,
    );
    expect(adminResponse.status).toBe(200);

    releasePut.resolve();
    expect((await keyResponsePromise).status).toBe(200);
  });

  it("releases the API key lease after malformed input and upload failures", async () => {
    const { env, handle, repo, service, storage } = await createFixture();
    const created = await service.createApiKey("Failure uploader");
    const malformed = await handle(
      new Request("https://admin.test/api/admin/items", {
        method: "POST",
        headers: { Authorization: `Bearer ${created.token}` },
        body: new FormData(),
      }),
      env,
    );
    expect(malformed.status).toBe(400);
    expect(repo.apiUploadLease).toBeNull();

    storage.nextPutError = new Error("storage unavailable");
    const failed = await handle(
      apiUploadRequest(created.token, "failed.html"),
      env,
    );
    expect(failed.status).toBe(500);
    expect(repo.apiUploadLease).toBeNull();

    const retry = await handle(
      apiUploadRequest(created.token, "recovered.html"),
      env,
    );
    expect(retry.status).toBe(200);
  });
});

describe("public routes", () => {
  it("keeps share URLs stable while exposing raw content separately", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const active = item({
      title: "产品介绍",
      originalFilename: "产品介绍.html",
      slug: "产品介绍-a1b2c3d4",
      objectKey: "objects/chinese/index.html",
    });
    await repo.createItem({ item: active });
    await storage.putObject(
      active.objectKey,
      new TextEncoder().encode("<h1>中文</h1>").buffer,
      HTML_CONTENT_TYPE,
    );

    const share = await handle(
      new Request(
        `https://public.test/p/${encodeURIComponent("产品介绍-a1b2c3d4")}`,
      ),
      env,
    );
    const shareHtml = await share.text();
    expect(share.status).toBe(200);
    expect(share.headers.get("Content-Type")).toBe(HTML_CONTENT_TYPE);
    expect(shareHtml).toContain("产品介绍");
    expect(shareHtml).toContain(
      `https://public.test/raw/${encodeURIComponent("产品介绍-a1b2c3d4")}`,
    );

    const raw = await handle(
      new Request(
        `https://public.test/raw/${encodeURIComponent("产品介绍-a1b2c3d4")}`,
      ),
      env,
    );
    expect(raw.status).toBe(200);
    expect(raw.headers.get("Content-Type")).toBe(HTML_CONTENT_TYPE);
    await expect(raw.text()).resolves.toBe("<h1>中文</h1>");
  });

  it("renders HTML shares inside a sandboxed viewer and preserves slug aliases", async () => {
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
    const html = await plain.text();
    expect(plain.status).toBe(200);
    expect(plain.headers.get("Cache-Control")).toBe(
      "public, max-age=0, s-maxage=3600",
    );
    expect(plain.headers.get("ETag")).toBeTruthy();
    expect(plain.headers.get("Last-Modified")).toBeTruthy();
    expect(plain.headers.get("Content-Security-Policy")).toContain(
      "frame-src 'self'",
    );
    expect(html).toContain(
      'src="https://public.test/raw/product-a1b2c3d4"',
    );
    expect(html).toContain('sandbox="allow-scripts"');

    for (const path of [
      "/p/product-a1b2c3d4/",
      "/p/product-a1b2c3d4.html",
    ]) {
      const response = await handle(
        new Request(`https://public.test${path}`),
        env,
      );
      expect(response.status).toBe(200);
    }

    const readsBeforeHead = storage.getReads;
    const head = await handle(
      new Request("https://public.test/p/product-a1b2c3d4", {
        method: "HEAD",
      }),
      env,
    );
    expect(head.status).toBe(200);
    expect(storage.getReads).toBe(readsBeforeHead);
    await expect(head.text()).resolves.toBe("");
  });

  it("serves raw HTML unchanged", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const source =
      '<!doctype html><html><head><title>Original</title></head><body><script>window.x=1</script></body></html>';
    const active = item({
      slug: "raw-html-a1b2c3d4",
      objectKey: "objects/raw-html/index.html",
      sizeBytes: new TextEncoder().encode(source).byteLength,
    });
    await repo.createItem({ item: active });
    await storage.putObject(
      active.objectKey,
      new TextEncoder().encode(source).buffer,
      HTML_CONTENT_TYPE,
    );

    const response = await handle(
      new Request("https://public.test/raw/raw-html-a1b2c3d4"),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(HTML_CONTENT_TYPE);
    await expect(response.text()).resolves.toBe(source);
  });

  it("serves public PDF byte ranges from the raw endpoint", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const bytes = new TextEncoder().encode("%PDF-1.7\n0123456789abcdef");
    const active = item({
      title: "Report",
      originalFilename: "report.pdf",
      slug: "report-a1b2c3d4",
      objectKey: "objects/report/index.pdf",
      contentType: PDF_CONTENT_TYPE,
      sizeBytes: bytes.byteLength,
    });
    await repo.createItem({ item: active });
    await storage.putObject(active.objectKey, bytes.buffer, PDF_CONTENT_TYPE);

    const share = await handle(
      new Request("https://public.test/p/report-a1b2c3d4"),
      env,
    );
    const shareHtml = await share.text();
    expect(share.status).toBe(200);
    expect(shareHtml).toContain(
      'src="https://public.test/raw/report-a1b2c3d4"',
    );

    const response = await handle(
      new Request("https://public.test/raw/report-a1b2c3d4", {
        headers: { Range: "bytes=9-13" },
      }),
      env,
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Range")).toBe(
      `bytes 9-13/${bytes.byteLength}`,
    );
    expect(response.headers.get("Content-Length")).toBe("5");
    expect(response.headers.get("Content-Type")).toBe(PDF_CONTENT_TYPE);
    expect(await response.text()).toBe("01234");
    expect(storage.rangeReads).toBe(1);

    const head = await handle(
      new Request("https://public.test/raw/report-a1b2c3d4", {
        method: "HEAD",
      }),
      env,
    );
    expect(head.status).toBe(200);
    expect(head.headers.get("Accept-Ranges")).toBe("bytes");
    expect(head.headers.get("Content-Length")).toBe(String(bytes.byteLength));
  });

  it("returns 416 for unsatisfiable raw PDF ranges", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const bytes = new TextEncoder().encode("%PDF-1.7");
    const active = item({
      originalFilename: "report.pdf",
      slug: "report-range-a1b2c3d4",
      objectKey: "objects/report-range/index.pdf",
      contentType: PDF_CONTENT_TYPE,
      sizeBytes: bytes.byteLength,
    });
    await repo.createItem({ item: active });
    await storage.putObject(active.objectKey, bytes.buffer, PDF_CONTENT_TYPE);

    const response = await handle(
      new Request("https://public.test/raw/report-range-a1b2c3d4", {
        headers: { Range: "bytes=999-" },
      }),
      env,
    );

    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe(
      `bytes */${bytes.byteLength}`,
    );
    expect(response.headers.get("Content-Length")).toBe("0");
    expect(storage.rangeReads).toBe(0);
  });

  it("falls back to a full raw PDF response when If-Range is stale", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const bytes = new TextEncoder().encode("%PDF-1.7\nfull-body");
    const active = item({
      originalFilename: "report.pdf",
      slug: "report-if-range-a1b2c3d4",
      objectKey: "objects/report-if-range/index.pdf",
      contentType: PDF_CONTENT_TYPE,
      sizeBytes: bytes.byteLength,
    });
    await repo.createItem({ item: active });
    await storage.putObject(active.objectKey, bytes.buffer, PDF_CONTENT_TYPE);

    const response = await handle(
      new Request("https://public.test/raw/report-if-range-a1b2c3d4", {
        headers: {
          Range: "bytes=0-3",
          "If-Range": 'W/"stale"',
        },
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Length")).toBe(String(bytes.byteLength));
    expect(await response.text()).toBe("%PDF-1.7\nfull-body");
    expect(storage.getReads).toBe(1);
    expect(storage.rangeReads).toBe(0);
  });

  it("returns 304 for matching share-viewer validators without reading the object", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const active = item();
    await repo.createItem({ item: active });
    await storage.putObject(
      active.objectKey,
      new TextEncoder().encode("<h1>ok</h1>").buffer,
      HTML_CONTENT_TYPE,
    );

    const head = await handle(
      new Request("https://public.test/p/product-a1b2c3d4", {
        method: "HEAD",
      }),
      env,
    );
    const etag = head.headers.get("ETag");
    expect(etag).toBeTruthy();
    const readsBeforeConditional = storage.getReads;

    const response = await handle(
      new Request("https://public.test/p/product-a1b2c3d4", {
        headers: { "If-None-Match": etag ?? "" },
      }),
      env,
    );

    expect(response.status).toBe(304);
    expect(storage.getReads).toBe(readsBeforeConditional);
    await expect(response.text()).resolves.toBe("");
  });

  it("renders Markdown in the share viewer while raw stays Markdown", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const markdown =
      "# Release Notes\n\n- [Install](#install)\n\n## Install\n\n**Shipped**\n\n<script>alert(1)</script>";
    const bytes = new TextEncoder().encode(markdown);
    const active = item({
      title: "Release Notes",
      originalFilename: "release-notes.md",
      slug: "release-notes-a1b2c3d4",
      objectKey: "objects/release-notes/index.md",
      contentType: MARKDOWN_CONTENT_TYPE,
      sizeBytes: bytes.byteLength,
    });
    await repo.createItem({ item: active });
    await storage.putObject(
      active.objectKey,
      bytes.buffer,
      MARKDOWN_CONTENT_TYPE,
    );

    const share = await handle(
      new Request("https://public.test/p/release-notes-a1b2c3d4"),
      env,
    );
    const html = await share.text();
    expect(share.status).toBe(200);
    expect(share.headers.get("Content-Type")).toBe(HTML_CONTENT_TYPE);
    expect(html).toContain('<h1 id="release-notes">Release Notes</h1>');
    expect(html).toContain('<h2 id="install">Install</h2>');
    expect(html).toContain("<strong>Shipped</strong>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain(
      '<meta property="og:url" content="https://public.test/p/release-notes-a1b2c3d4">',
    );

    const raw = await handle(
      new Request("https://public.test/raw/release-notes-a1b2c3d4"),
      env,
    );
    expect(raw.status).toBe(200);
    expect(raw.headers.get("Content-Type")).toBe(MARKDOWN_CONTENT_TYPE);
    await expect(raw.text()).resolves.toBe(markdown);
  });

  it("uses the raw image as the share preview image", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const active = item({
      title: "Diagram",
      originalFilename: "diagram.png",
      slug: "diagram-a1b2c3d4",
      objectKey: "objects/diagram/index.png",
      contentType: PNG_CONTENT_TYPE,
      sizeBytes: bytes.byteLength,
    });
    await repo.createItem({ item: active });
    await storage.putObject(active.objectKey, bytes.buffer, PNG_CONTENT_TYPE);

    const share = await handle(
      new Request("https://public.test/p/diagram-a1b2c3d4"),
      env,
    );
    const html = await share.text();
    expect(share.status).toBe(200);
    expect(share.headers.get("Content-Type")).toBe(HTML_CONTENT_TYPE);
    expect(html).toContain(
      '<meta property="og:image" content="https://public.test/raw/diagram-a1b2c3d4">',
    );
    expect(html).toContain(
      'src="https://public.test/raw/diagram-a1b2c3d4"',
    );

    const raw = await handle(
      new Request("https://public.test/raw/diagram-a1b2c3d4"),
      env,
    );
    expect(raw.status).toBe(200);
    expect(raw.headers.get("Content-Type")).toBe(PNG_CONTENT_TYPE);
    expect(new Uint8Array(await raw.arrayBuffer())).toEqual(bytes);
  });

  it("owns share metadata at the viewer layer instead of modifying raw HTML", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const source = `<!doctype html>
<html>
<head>
  <title>Document title</title>
  <meta name="description" content="Pinned description">
</head>
<body><p>Body text.</p></body>
</html>`;
    const bytes = new TextEncoder().encode(source);
    const active = item({
      title: "Stored fallback",
      slug: "report-a1b2c3d4",
      objectKey: "objects/report/index.html",
      sizeBytes: bytes.byteLength,
    });
    await repo.createItem({ item: active });
    await storage.putObject(active.objectKey, bytes.buffer, HTML_CONTENT_TYPE);

    const share = await handle(
      new Request("https://public.test/p/report-a1b2c3d4.html"),
      env,
    );
    const shareHtml = await share.text();
    expect(share.status).toBe(200);
    expect(shareHtml).toContain(
      '<meta property="og:title" content="Stored fallback">',
    );
    expect(shareHtml).toContain(
      '<meta property="og:url" content="https://public.test/p/report-a1b2c3d4">',
    );
    expect(shareHtml).toContain(
      '<link rel="canonical" href="https://public.test/p/report-a1b2c3d4">',
    );
    expect(shareHtml).not.toContain("Pinned description");

    const raw = await handle(
      new Request("https://public.test/raw/report-a1b2c3d4"),
      env,
    );
    await expect(raw.text()).resolves.toBe(source);
  });

  it("serves production share and raw URLs without admin credentials", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const productionEnv = {
      ...env,
      ADMIN_BASE_URL: "https://admin-html.example.com",
      PUBLIC_BASE_URL: "https://h.example.com",
    };
    const source = "<h1>public</h1>";
    const active = item({
      slug: "html-ed559a5f",
      objectKey: "objects/html-ed559a5f/index.html",
      sizeBytes: new TextEncoder().encode(source).byteLength,
    });
    await repo.createItem({ item: active });
    await storage.putObject(
      active.objectKey,
      new TextEncoder().encode(source).buffer,
      HTML_CONTENT_TYPE,
    );

    const share = await handle(
      new Request("https://h.example.com/p/html-ed559a5f"),
      productionEnv,
    );
    expect(share.status).toBe(200);
    expect(await share.text()).toContain(
      'src="https://h.example.com/raw/html-ed559a5f"',
    );

    const raw = await handle(
      new Request("https://h.example.com/raw/html-ed559a5f"),
      productionEnv,
    );
    expect(raw.status).toBe(200);
    await expect(raw.text()).resolves.toBe(source);
  });

  it("clamps share viewer cache TTL to item expiry", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const urlExpiresAt = new Date(Date.now() + 60_000).toISOString();
    const active = item({
      slug: "short-cache-a1b2c3d4",
      objectKey: "objects/short-cache/index.html",
      urlExpiresAt,
    });
    await repo.createItem({ item: active });
    await storage.putObject(
      active.objectKey,
      new TextEncoder().encode("<h1>short</h1>").buffer,
      HTML_CONTENT_TYPE,
    );

    const response = await handle(
      new Request("https://public.test/p/short-cache-a1b2c3d4"),
      env,
    );

    expect(response.status).toBe(200);
    const cacheControl = response.headers.get("Cache-Control") ?? "";
    const ttl = Number(/s-maxage=(\d+)/.exec(cacheControl)?.[1] ?? Number.NaN);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it("keeps public host enumeration and API paths hidden", async () => {
    const { env, handle } = await createFixture();
    for (const path of ["/", "/api/admin/items", "/files", "/raw"]) {
      const response = await handle(
        new Request(`https://public.test${path}`),
        env,
      );
      expect(response.status).toBe(404);
    }
  });

  it("does not cache non-public item state responses", async () => {
    const { env, handle, repo, storage } = await createFixture();
    const disabled = item({
      id: "disabled",
      slug: "disabled-a1b2c3d4",
      objectKey: "objects/disabled/index.html",
      status: "disabled",
    });
    await repo.createItem({ item: disabled });
    await storage.putObject(
      disabled.objectKey,
      new ArrayBuffer(1),
      HTML_CONTENT_TYPE,
    );

    for (const path of [
      "/p/disabled-a1b2c3d4",
      "/raw/disabled-a1b2c3d4",
    ]) {
      const response = await handle(
        new Request(`https://public.test${path}`),
        env,
      );
      expect(response.status).toBe(403);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });

  it("returns 404 for malformed encoded slugs on share and raw routes", async () => {
    const { env, handle } = await createFixture();
    for (const path of ["/p/%E0%A4%A", "/raw/%E0%A4%A"]) {
      const response = await handle(
        new Request(`https://public.test${path}`),
        env,
      );
      expect(response.status).toBe(404);
    }
  });

  it("maps share and raw item states to the same status codes", async () => {
    const { env, handle, repo } = await createFixture();
    const disabled = item({
      id: "disabled",
      slug: "disabled-a1b2c3d4",
      status: "disabled",
    });
    const privateItem = item({
      id: "private",
      slug: "private-a1b2c3d4",
      visibility: "private",
    });
    const expired = item({
      id: "expired",
      slug: "expired-a1b2c3d4",
      urlExpiresAt: "2026-01-01T00:00:00.000Z",
    });
    await repo.createItem({ item: disabled });
    await repo.createItem({ item: privateItem });
    await repo.createItem({ item: expired });

    for (const prefix of ["/p/", "/raw/"]) {
      await expect(
        handle(
          new Request(`https://public.test${prefix}disabled-a1b2c3d4`),
          env,
        ),
      ).resolves.toMatchObject({ status: 403 });
      await expect(
        handle(
          new Request(`https://public.test${prefix}private-a1b2c3d4`),
          env,
        ),
      ).resolves.toMatchObject({ status: 404 });
      await expect(
        handle(
          new Request(`https://public.test${prefix}expired-a1b2c3d4`),
          env,
        ),
      ).resolves.toMatchObject({ status: 410 });
    }
  });
});

describe("access counter", () => {
  it("batches public access counts until flushed", async () => {
    resetAccessCounterForTests(new Date("2026-07-05T00:00:00.000Z").getTime());
    const { env, repo, service } = await createFixture();
    await repo.createItem({ item: item({ id: "a", slug: "a-a1b2c3d4" }) });

    recordPublicAccess(
      service,
      {
        ...env,
        ACCESS_COUNT_MODE: "windowed",
        ACCESS_COUNT_FLUSH_SECONDS: "300",
      },
      undefined,
      "a",
      "a-a1b2c3d4",
      new Date("2026-07-05T00:01:00.000Z"),
    );
    recordPublicAccess(
      service,
      {
        ...env,
        ACCESS_COUNT_MODE: "windowed",
        ACCESS_COUNT_FLUSH_SECONDS: "300",
      },
      undefined,
      "a",
      "a-a1b2c3d4",
      new Date("2026-07-05T00:02:00.000Z"),
    );

    expect((await repo.getItemById("a"))?.accessCount).toBe(0);
    await flushAccessCounts(service);
    expect((await repo.getItemById("a"))?.accessCount).toBe(2);
    expect(repo.accessWrites).toBe(1);
  });
});
