import { HTML_CONTENT_TYPE } from "@pagevault/core";
import { describe, expect, it } from "vitest";
import { CloudflareD1Repository } from "../cloudflare-db.js";
import type { HtmlItemRow } from "../item-row.js";

class FakeD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): FakeD1Statement {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    this.db.firstSqls.push(this.sql);
    return (this.db.firstResult ?? { total: this.db.total }) as T;
  }

  async all<T>(): Promise<{ results: T[] }> {
    this.db.allSqls.push(this.sql);
    this.db.allValues.push(this.values);
    return { results: this.db.rows as T[] };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    this.db.runSqls.push(this.sql);
    this.db.runValues.push(this.values);
    return { meta: { changes: this.db.runChanges } };
  }
}

class FakeD1Database {
  readonly firstSqls: string[] = [];
  readonly allSqls: string[] = [];
  readonly allValues: unknown[][] = [];
  readonly runSqls: string[] = [];
  readonly runValues: unknown[][] = [];
  runChanges = 1;
  firstResult: Record<string, unknown> | null = null;

  constructor(
    readonly rows: HtmlItemRow[],
    readonly total: number,
  ) {}

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(this, sql);
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}

function row(id: string): HtmlItemRow {
  return {
    id,
    title: `Item ${id}`,
    original_filename: `${id}.html`,
    slug: `item-${id}`,
    object_key: `objects/${id}/index.html`,
    content_type: HTML_CONTENT_TYPE,
    size_bytes: 1,
    sha256: "hash",
    visibility: "public",
    status: "active",
    url_expires_at: "2026-07-12T00:00:00.000Z",
    file_expires_at: "2027-01-01T00:00:00.000Z",
    access_count: 0,
    last_accessed_at: null,
    created_at: "2026-07-05T00:00:00.000Z",
    updated_at: "2026-07-05T00:00:00.000Z",
    deleted_at: null,
  };
}

describe("CloudflareD1Repository listItems", () => {
  it("uses lightweight pagination by default", async () => {
    const db = new FakeD1Database([row("a"), row("b"), row("c")], 3);
    const repository = new CloudflareD1Repository(db.asD1());

    const result = await repository.listItems({ page: 1, pageSize: 2 });

    expect(db.firstSqls).toHaveLength(0);
    expect(db.allValues[0]?.slice(-2)).toEqual([3, 0]);
    expect(result.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result.total).toBeNull();
    expect(result.hasNextPage).toBe(true);
  });

  it("runs the count query only when exact totals are requested", async () => {
    const db = new FakeD1Database([row("a"), row("b")], 4);
    const repository = new CloudflareD1Repository(db.asD1());

    const result = await repository.listItems({
      page: 1,
      pageSize: 2,
      includeTotal: true,
    });

    expect(db.firstSqls[0]).toContain("COUNT(*)");
    expect(db.allValues[0]?.slice(-2)).toEqual([2, 0]);
    expect(result.total).toBe(4);
    expect(result.hasNextPage).toBe(true);
  });
});

describe("CloudflareD1Repository getItemsByIds", () => {
  it("loads multiple ids with one IN query per chunk", async () => {
    const db = new FakeD1Database([row("a"), row("b")], 0);
    const repository = new CloudflareD1Repository(db.asD1());

    const result = await repository.getItemsByIds(["a", "b", "a"]);

    expect(db.allSqls).toHaveLength(1);
    expect(db.allSqls[0]).toContain("WHERE id IN (?, ?)");
    expect(db.allValues[0]).toEqual(["a", "b"]);
    expect(result.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("CloudflareD1Repository dashboard stats", () => {
  it("returns stored bytes from the existing aggregate query", async () => {
    const db = new FakeD1Database([], 0);
    db.firstResult = {
      total: 2,
      total_size_bytes: 3_072,
      public_count: 1,
      url_expired: 0,
      file_deleting_soon: 1,
      deleted: 1,
    };
    const repository = new CloudflareD1Repository(db.asD1());

    await expect(
      repository.getDashboardStats(
        "2026-07-05T00:00:00.000Z",
        "2026-07-12T00:00:00.000Z",
      ),
    ).resolves.toEqual({
      total: 2,
      totalSizeBytes: 3_072,
      publicCount: 1,
      urlExpired: 0,
      fileDeletingSoon: 1,
      deleted: 1,
    });
    expect(db.firstSqls).toHaveLength(1);
    expect(db.firstSqls[0]).toContain("total_size_bytes");
  });
});

describe("CloudflareD1Repository API upload idempotency", () => {
  it("claims, detects in-flight/conflicting requests, and completes owner-matched records", async () => {
    const db = new FakeD1Database([], 0);
    const repository = new CloudflareD1Repository(db.asD1());
    db.firstResult = {
      request_hash: "hash-a",
      item_id: "item-a",
      status: "processing",
      owner: "owner-a",
    };

    await expect(
      repository.claimApiUploadIdempotency({
        apiKeyId: "key-a",
        idempotencyKey: "request-a",
        requestHash: "hash-a",
        candidateItemId: "item-a",
        owner: "owner-a",
        now: "2026-07-05T00:00:00.000Z",
        expiresAt: "2026-07-05T00:15:00.000Z",
      }),
    ).resolves.toEqual({ kind: "acquired", itemId: "item-a" });
    expect(db.runSqls[0]).toContain(
      "ON CONFLICT(api_key_id, idempotency_key) DO UPDATE",
    );
    expect(db.runSqls[0]).toContain(
      "api_upload_idempotency.expires_at <= excluded.updated_at",
    );

    db.runChanges = 0;
    await expect(
      repository.claimApiUploadIdempotency({
        apiKeyId: "key-a",
        idempotencyKey: "request-a",
        requestHash: "hash-a",
        candidateItemId: "item-b",
        owner: "owner-b",
        now: "2026-07-05T00:01:00.000Z",
        expiresAt: "2026-07-05T00:16:00.000Z",
      }),
    ).resolves.toEqual({ kind: "in_progress", itemId: "item-a" });

    db.firstResult = {
      request_hash: "hash-old",
      item_id: "item-a",
      status: "processing",
      owner: "owner-a",
    };
    await expect(
      repository.claimApiUploadIdempotency({
        apiKeyId: "key-a",
        idempotencyKey: "request-a",
        requestHash: "hash-new",
        candidateItemId: "item-c",
        owner: "owner-c",
        now: "2026-07-05T00:02:00.000Z",
        expiresAt: "2026-07-05T00:17:00.000Z",
      }),
    ).resolves.toEqual({ kind: "conflict", itemId: "item-a" });

    db.runChanges = 1;
    await repository.completeApiUploadIdempotency(
      "key-a",
      "request-a",
      "owner-a",
      "2026-07-05T00:03:00.000Z",
      "2026-07-06T00:03:00.000Z",
    );
    expect(db.runSqls.at(-1)).toContain("status = 'completed'");
    expect(db.runSqls.at(-1)).toContain("owner = ?");
  });
});

