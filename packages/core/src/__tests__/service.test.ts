import { describe, expect, it } from "vitest";
import {
  HTML_CONTENT_TYPE,
  JPEG_CONTENT_TYPE,
  MARKDOWN_CONTENT_TYPE,
  PNG_CONTENT_TYPE,
  WEBP_CONTENT_TYPE,
} from "../constants.js";
import { addDays } from "../expiry.js";
import type { MetadataRepository } from "../repository.js";
import { PageVaultService, createPageVaultConfig } from "../service.js";
import type { StorageProvider, StoredObject } from "../storage.js";
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
  UpdateItemInput,
} from "../types.js";

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
  readonly apiKeys = new Map<string, { apiKey: ApiKey; tokenHash: string }>();
  readonly audits: AuditLogInput[] = [];
  apiKeyUsageWrites = 0;

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
    this.apiKeyUsageWrites += 1;
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
    const items = Array.from(this.items.values()).filter(
      (item) => input.includeDeleted || item.status !== "deleted",
    );
    const page = Math.max(1, input.page);
    const pageSize = Math.max(1, input.pageSize);
    const offset = (page - 1) * pageSize;
    const pageItems = items.slice(offset, offset + pageSize);
    return {
      items: pageItems,
      page,
      pageSize,
      total: input.includeTotal ? items.length : null,
      hasNextPage: offset + pageSize < items.length,
    };
  }

  async getDashboardStats(now: string, soon: string): Promise<DashboardStats> {
    const items = Array.from(this.items.values());
    return {
      total: items.filter((nextItem) => nextItem.status !== "deleted").length,
      publicCount: items.filter(
        (nextItem) =>
          nextItem.status === "active" && nextItem.visibility === "public",
      ).length,
      urlExpired: items.filter(
        (nextItem) =>
          nextItem.status !== "deleted" && nextItem.urlExpiresAt <= now,
      ).length,
      fileDeletingSoon: items.filter(
        (nextItem) =>
          nextItem.status !== "deleted" &&
          nextItem.fileExpiresAt > now &&
          nextItem.fileExpiresAt <= soon,
      ).length,
      deleted: items.filter((nextItem) => nextItem.status === "deleted").length,
    };
  }

  async updateItem(id: string, patch: UpdateItemInput): Promise<HtmlItem> {
    const item = this.items.get(id);
    if (!item) {
      throw new Error("missing");
    }
    const next = { ...item, ...patch };
    this.items.set(id, next);
    return next;
  }

  async markDeleted(id: string, deletedAt: string): Promise<void> {
    const item = this.items.get(id);
    if (item) {
      this.items.set(id, {
        ...item,
        status: "deleted",
        deletedAt,
        updatedAt: deletedAt,
      });
    }
  }

  async incrementAccess(id: string, accessedAt: string): Promise<void> {
    await this.incrementAccessBatch([{ id, count: 1, accessedAt }]);
  }

  async incrementAccessBatch(input: AccessCountInput[]): Promise<void> {
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

  async findExpiredFiles(now: string, limit: number): Promise<HtmlItem[]> {
    return Array.from(this.items.values())
      .filter((item) => item.status !== "deleted" && item.fileExpiresAt <= now)
      .slice(0, limit);
  }

  async writeAuditLog(input: AuditLogInput): Promise<void> {
    this.audits.push(input);
  }
}

function createService() {
  const repo = new MemoryRepository();
  const storage = new MemoryStorage();
  const service = new PageVaultService(
    repo,
    storage,
    createPageVaultConfig({
      publicBaseUrl: "https://h.example.com",
    }),
  );
  return { service, repo, storage };
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

describe("access counting", () => {
  it("records access counts in batches", async () => {
    const { service, repo } = createService();
    await repo.createItem({ item: item({ id: "a", slug: "a-a1b2c3d4" }) });
    await repo.createItem({ item: item({ id: "b", slug: "b-a1b2c3d4" }) });

    await service.recordAccessBatch([
      { id: "a", count: 4, accessedAt: "2026-07-05T00:01:00.000Z" },
      { id: "b", count: 2, accessedAt: "2026-07-05T00:02:00.000Z" },
      { id: "b", count: 0, accessedAt: "2026-07-05T00:03:00.000Z" },
    ]);

    expect((await repo.getItemById("a"))?.accessCount).toBe(4);
    expect((await repo.getItemById("a"))?.lastAccessedAt).toBe(
      "2026-07-05T00:01:00.000Z",
    );
    expect((await repo.getItemById("b"))?.accessCount).toBe(2);
  });
});

describe("API keys", () => {
  it("stores only a token hash and throttles last-used writes", async () => {
    const { service, repo } = createService();
    const createdAt = new Date("2026-07-05T00:00:00.000Z");
    const created = await service.createApiKey("Automation", createdAt);

    expect(created.token).toMatch(/^pvk_[0-9a-f]{64}$/);
    expect(created.apiKey).toMatchObject({
      name: "Automation",
      prefix: created.token.slice(0, 12),
      lastUsedAt: null,
      revokedAt: null,
    });
    const stored = repo.apiKeys.get(created.apiKey.id);
    expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.tokenHash).not.toContain(created.token);

    const firstUse = new Date("2026-07-05T01:00:00.000Z");
    await expect(
      service.authenticateApiKey(created.token, firstUse),
    ).resolves.toMatchObject({ id: created.apiKey.id });
    await service.authenticateApiKey(
      created.token,
      new Date("2026-07-05T01:30:00.000Z"),
    );
    expect(repo.apiKeyUsageWrites).toBe(1);
  });

  it("rejects malformed and revoked keys", async () => {
    const { service } = createService();
    const created = await service.createApiKey("CI");

    await expect(service.authenticateApiKey("not-a-key")).resolves.toBeNull();
    await service.revokeApiKey(created.apiKey.id);
    await expect(service.authenticateApiKey(created.token)).resolves.toBeNull();
  });
});

describe("upload", () => {
  it("stores supported file types with derived metadata", async () => {
    const { service, storage } = createService();
    const now = new Date("2026-07-05T00:00:00.000Z");
    const uploads = [
      {
        filename: "产品介绍.html",
        contentType: HTML_CONTENT_TYPE,
        storageExtension: ".html",
        slugPattern: /^产品介绍-[0-9a-f]{8}$/,
      },
      {
        filename: "notes.md",
        contentType: MARKDOWN_CONTENT_TYPE,
        storageExtension: ".md",
        slugPattern: /^notes-[0-9a-f]{8}$/,
      },
      {
        filename: "photo.jpeg",
        contentType: JPEG_CONTENT_TYPE,
        storageExtension: ".jpg",
        slugPattern: /^photo-[0-9a-f]{8}$/,
      },
      {
        filename: "diagram.png",
        contentType: PNG_CONTENT_TYPE,
        storageExtension: ".png",
        slugPattern: /^diagram-[0-9a-f]{8}$/,
      },
      {
        filename: "cover.webp",
        contentType: WEBP_CONTENT_TYPE,
        storageExtension: ".webp",
        slugPattern: /^cover-[0-9a-f]{8}$/,
      },
    ];

    for (const [index, upload] of uploads.entries()) {
      const result = await service.uploadHtml({
        filename: upload.filename,
        body: new Uint8Array([index]).buffer,
        now,
      });

      expect(result.item.slug).toMatch(upload.slugPattern);
      expect(result.item.contentType).toBe(upload.contentType);
      expect(result.item.objectKey).toMatch(
        new RegExp(`/index\\${upload.storageExtension}$`),
      );
      expect(storage.objects.get(result.item.objectKey)?.contentType).toBe(
        upload.contentType,
      );
    }
  });

  it("rejects unsupported file types", async () => {
    const { service } = createService();
    await expect(
      service.uploadHtml({
        filename: "notes.txt",
        body: new ArrayBuffer(1),
      }),
    ).rejects.toMatchObject({
      code: "invalid_file_type",
      status: 400,
    });
  });
});

describe("public access", () => {
  const now = new Date("2026-07-05T00:00:00.000Z");

  it("returns 404 for missing slug", async () => {
    const { service } = createService();
    await expect(service.getPublicHtml("missing", now)).resolves.toEqual({
      kind: "not_found",
    });
  });

  it("returns 404 for private items", async () => {
    const { service, repo } = createService();
    await repo.createItem({ item: item({ visibility: "private" }) });
    await expect(
      service.getPublicHtml("product-a1b2c3d4", now),
    ).resolves.toEqual({ kind: "not_found" });
  });

  it("returns 403 for disabled items", async () => {
    const { service, repo } = createService();
    await repo.createItem({ item: item({ status: "disabled" }) });
    await expect(
      service.getPublicHtml("product-a1b2c3d4", now),
    ).resolves.toEqual({ kind: "disabled" });
  });

  it("returns 410 for URL expiry", async () => {
    const { service, repo } = createService();
    await repo.createItem({
      item: item({ urlExpiresAt: addDays(now, -1).toISOString() }),
    });
    await expect(
      service.getPublicHtml("product-a1b2c3d4", now),
    ).resolves.toEqual({ kind: "gone" });
  });

  it("returns 410 for file expiry", async () => {
    const { service, repo } = createService();
    await repo.createItem({ item: item({ fileExpiresAt: now.toISOString() }) });
    await expect(
      service.getPublicHtml("product-a1b2c3d4", now),
    ).resolves.toEqual({ kind: "gone" });
  });

  it("returns 200-equivalent result for active public items", async () => {
    const { service, repo, storage } = createService();
    const active = item();
    await repo.createItem({ item: active });
    await storage.putObject(
      active.objectKey,
      new TextEncoder().encode("<h1>ok</h1>").buffer,
      HTML_CONTENT_TYPE,
    );
    const result = await service.getPublicHtml(active.slug, now);
    expect(result.kind).toBe("ok");
  });
});

describe("batch", () => {
  it("extends URL and file expiries", async () => {
    const { service, repo } = createService();
    await repo.createItem({ item: item({ id: "a", slug: "a-a1b2c3d4" }) });
    await repo.createItem({ item: item({ id: "b", slug: "b-a1b2c3d4" }) });
    await service.batchUpdate({
      ids: ["a", "b"],
      action: "extend_url",
      days: 7,
      now: new Date("2026-07-05T00:00:00.000Z"),
    });
    await service.batchUpdate({
      ids: ["a", "b"],
      action: "extend_file",
      days: 180,
      now: new Date("2026-07-05T00:00:00.000Z"),
    });
    expect((await repo.getItemById("a"))?.urlExpiresAt).toBe(
      "2026-07-19T00:00:00.000Z",
    );
    expect((await repo.getItemById("b"))?.fileExpiresAt).toBe(
      "2027-06-30T00:00:00.000Z",
    );
  });

  it("disables and deletes items", async () => {
    const { service, repo, storage } = createService();
    const first = item({
      id: "a",
      slug: "a-a1b2c3d4",
      objectKey: "objects/a/index.html",
    });
    const second = item({
      id: "b",
      slug: "b-a1b2c3d4",
      objectKey: "objects/b/index.html",
    });
    await repo.createItem({ item: first });
    await repo.createItem({ item: second });
    await storage.putObject(
      first.objectKey,
      new ArrayBuffer(1),
      HTML_CONTENT_TYPE,
    );
    await storage.putObject(
      second.objectKey,
      new ArrayBuffer(1),
      HTML_CONTENT_TYPE,
    );

    await service.batchUpdate({ ids: ["a"], action: "disable" });
    await service.batchUpdate({ ids: ["b"], action: "delete" });

    expect((await repo.getItemById("a"))?.status).toBe("disabled");
    expect((await repo.getItemById("b"))?.status).toBe("deleted");
    expect(await storage.getObject(second.objectKey)).toBeNull();
  });
});

describe("garbage collection", () => {
  it("deletes file-expired objects and marks metadata deleted", async () => {
    const { service, repo, storage } = createService();
    const now = new Date("2026-07-05T00:00:00.000Z");
    const expired = item({
      id: "expired",
      slug: "expired-a1b2c3d4",
      objectKey: "objects/expired/index.html",
      fileExpiresAt: now.toISOString(),
    });
    await repo.createItem({ item: expired });
    await storage.putObject(
      expired.objectKey,
      new ArrayBuffer(1),
      HTML_CONTENT_TYPE,
    );

    const result = await service.garbageCollectExpiredFiles(now);

    expect(result).toMatchObject({
      scanned: 1,
      deleted: 1,
      deletedSlugs: [expired.slug],
      failed: [],
    });
    expect((await repo.getItemById("expired"))?.status).toBe("deleted");
    expect(await storage.getObject(expired.objectKey)).toBeNull();
  });
});

describe("dashboard stats", () => {
  it("counts all repository items without list pagination", async () => {
    const { service, repo } = createService();
    const now = new Date("2026-07-05T00:00:00.000Z");

    for (let index = 0; index < 125; index += 1) {
      await repo.createItem({
        item: item({
          id: `active-${index}`,
          slug: `active-${index}-a1b2c3d4`,
          objectKey: `objects/active-${index}/index.html`,
        }),
      });
    }
    await repo.createItem({
      item: item({
        id: "expired",
        slug: "expired-a1b2c3d4",
        objectKey: "objects/expired/index.html",
        urlExpiresAt: addDays(now, -1).toISOString(),
      }),
    });
    await repo.createItem({
      item: item({
        id: "soon",
        slug: "soon-a1b2c3d4",
        objectKey: "objects/soon/index.html",
        fileExpiresAt: addDays(now, 3).toISOString(),
      }),
    });
    await repo.createItem({
      item: item({
        id: "deleted",
        slug: "deleted-a1b2c3d4",
        objectKey: "objects/deleted/index.html",
        status: "deleted",
      }),
    });

    await expect(service.getDashboardStats(now)).resolves.toEqual({
      total: 127,
      publicCount: 127,
      urlExpired: 1,
      fileDeletingSoon: 1,
      deleted: 1,
    });
  });
});
