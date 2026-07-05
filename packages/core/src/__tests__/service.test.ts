import { describe, expect, it } from "vitest";
import { HTML_CONTENT_TYPE } from "../constants.js";
import { addDays } from "../expiry.js";
import type { MetadataRepository } from "../repository.js";
import { HtmlBedService, createHtmlBedConfig } from "../service.js";
import type { StorageProvider, StoredObject } from "../storage.js";
import type {
  AuditLogInput,
  CreateItemInput,
  DashboardStats,
  HtmlItem,
  ListItemsInput,
  ListItemsResult,
  UpdateItemInput
} from "../types.js";

class MemoryStorage implements StorageProvider {
  readonly objects = new Map<string, StoredObject>();

  async putObject(key: string, body: ArrayBuffer, contentType: string): Promise<void> {
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
  readonly audits: AuditLogInput[] = [];

  async createItem(input: CreateItemInput): Promise<HtmlItem> {
    this.items.set(input.item.id, input.item);
    return input.item;
  }

  async getItemById(id: string): Promise<HtmlItem | null> {
    return this.items.get(id) ?? null;
  }

  async getItemBySlug(slug: string): Promise<HtmlItem | null> {
    return Array.from(this.items.values()).find((item) => item.slug === slug) ?? null;
  }

  async listItems(input: ListItemsInput): Promise<ListItemsResult> {
    const items = Array.from(this.items.values()).filter((item) => input.includeDeleted || item.status !== "deleted");
    return { items, page: input.page, pageSize: input.pageSize, total: items.length };
  }

  async getDashboardStats(now: string, soon: string): Promise<DashboardStats> {
    const items = Array.from(this.items.values());
    return {
      total: items.filter((nextItem) => nextItem.status !== "deleted").length,
      publicCount: items.filter(
        (nextItem) => nextItem.status === "active" && nextItem.visibility === "public"
      ).length,
      urlExpired: items.filter(
        (nextItem) => nextItem.status !== "deleted" && nextItem.urlExpiresAt <= now
      ).length,
      fileDeletingSoon: items.filter(
        (nextItem) =>
          nextItem.status !== "deleted" &&
          nextItem.fileExpiresAt > now &&
          nextItem.fileExpiresAt <= soon
      ).length,
      deleted: items.filter((nextItem) => nextItem.status === "deleted").length
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
      this.items.set(id, { ...item, status: "deleted", deletedAt, updatedAt: deletedAt });
    }
  }

  async incrementAccess(id: string, accessedAt: string): Promise<void> {
    const item = this.items.get(id);
    if (item) {
      this.items.set(id, {
        ...item,
        accessCount: item.accessCount + 1,
        lastAccessedAt: accessedAt
      });
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
  const service = new HtmlBedService(
    repo,
    storage,
    createHtmlBedConfig({
      publicBaseUrl: "https://h.example.com"
    })
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
    ...overrides
  };
}

describe("public access", () => {
  const now = new Date("2026-07-05T00:00:00.000Z");

  it("returns 404 for missing slug", async () => {
    const { service } = createService();
    await expect(service.getPublicHtml("missing", now)).resolves.toEqual({ kind: "not_found" });
  });

  it("returns 404 for private items", async () => {
    const { service, repo } = createService();
    await repo.createItem({ item: item({ visibility: "private" }) });
    await expect(service.getPublicHtml("product-a1b2c3d4", now)).resolves.toEqual({ kind: "not_found" });
  });

  it("returns 403 for disabled items", async () => {
    const { service, repo } = createService();
    await repo.createItem({ item: item({ status: "disabled" }) });
    await expect(service.getPublicHtml("product-a1b2c3d4", now)).resolves.toEqual({ kind: "disabled" });
  });

  it("returns 410 for URL expiry", async () => {
    const { service, repo } = createService();
    await repo.createItem({ item: item({ urlExpiresAt: addDays(now, -1).toISOString() }) });
    await expect(service.getPublicHtml("product-a1b2c3d4", now)).resolves.toEqual({ kind: "gone" });
  });

  it("returns 410 for file expiry", async () => {
    const { service, repo } = createService();
    await repo.createItem({ item: item({ fileExpiresAt: now.toISOString() }) });
    await expect(service.getPublicHtml("product-a1b2c3d4", now)).resolves.toEqual({ kind: "gone" });
  });

  it("returns 200-equivalent result for active public items", async () => {
    const { service, repo, storage } = createService();
    const active = item();
    await repo.createItem({ item: active });
    await storage.putObject(active.objectKey, new TextEncoder().encode("<h1>ok</h1>").buffer, HTML_CONTENT_TYPE);
    const result = await service.getPublicHtml(active.slug, now);
    expect(result.kind).toBe("ok");
  });
});

describe("batch", () => {
  it("extends URL and file expiries", async () => {
    const { service, repo } = createService();
    await repo.createItem({ item: item({ id: "a", slug: "a-a1b2c3d4" }) });
    await repo.createItem({ item: item({ id: "b", slug: "b-a1b2c3d4" }) });
    await service.batchUpdate({ ids: ["a", "b"], action: "extend_url", days: 7, now: new Date("2026-07-05T00:00:00.000Z") });
    await service.batchUpdate({ ids: ["a", "b"], action: "extend_file", days: 180, now: new Date("2026-07-05T00:00:00.000Z") });
    expect((await repo.getItemById("a"))?.urlExpiresAt).toBe("2026-07-19T00:00:00.000Z");
    expect((await repo.getItemById("b"))?.fileExpiresAt).toBe("2027-06-30T00:00:00.000Z");
  });

  it("disables and deletes items", async () => {
    const { service, repo, storage } = createService();
    const first = item({ id: "a", slug: "a-a1b2c3d4", objectKey: "objects/a/index.html" });
    const second = item({ id: "b", slug: "b-a1b2c3d4", objectKey: "objects/b/index.html" });
    await repo.createItem({ item: first });
    await repo.createItem({ item: second });
    await storage.putObject(first.objectKey, new ArrayBuffer(1), HTML_CONTENT_TYPE);
    await storage.putObject(second.objectKey, new ArrayBuffer(1), HTML_CONTENT_TYPE);

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
      fileExpiresAt: now.toISOString()
    });
    await repo.createItem({ item: expired });
    await storage.putObject(expired.objectKey, new ArrayBuffer(1), HTML_CONTENT_TYPE);

    const result = await service.garbageCollectExpiredFiles(now);

    expect(result).toMatchObject({ scanned: 1, deleted: 1, failed: [] });
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
          objectKey: `objects/active-${index}/index.html`
        })
      });
    }
    await repo.createItem({
      item: item({
        id: "expired",
        slug: "expired-a1b2c3d4",
        objectKey: "objects/expired/index.html",
        urlExpiresAt: addDays(now, -1).toISOString()
      })
    });
    await repo.createItem({
      item: item({
        id: "soon",
        slug: "soon-a1b2c3d4",
        objectKey: "objects/soon/index.html",
        fileExpiresAt: addDays(now, 3).toISOString()
      })
    });
    await repo.createItem({
      item: item({
        id: "deleted",
        slug: "deleted-a1b2c3d4",
        objectKey: "objects/deleted/index.html",
        status: "deleted"
      })
    });

    await expect(service.getDashboardStats(now)).resolves.toEqual({
      total: 127,
      publicCount: 127,
      urlExpired: 1,
      fileDeletingSoon: 1,
      deleted: 1
    });
  });
});
