import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { HTML_CONTENT_TYPE } from "@pagevault/core";
import { describe, expect, it } from "vitest";
import { NodeSqliteRepository } from "../node-db.js";

describe("NodeSqliteRepository API upload idempotency", () => {
  it("applies the migration idempotently and scopes/replays claims safely", async () => {
    const db = new DatabaseSync(":memory:");
    const repository = new NodeSqliteRepository(db);
    const migrationPath = fileURLToPath(
      new URL(
        "../../../../../migrations/0004_api_upload_idempotency.sql",
        import.meta.url,
      ),
    );

    try {
      await repository.migrate(migrationPath);
      await repository.migrate(migrationPath);

      const first = await repository.claimApiUploadIdempotency({
        apiKeyId: "api-a",
        idempotencyKey: "request-1",
        requestHash: "hash-a",
        candidateItemId: "item-a",
        owner: "owner-a",
        now: "2026-07-05T00:00:00.000Z",
        expiresAt: "2026-07-05T00:15:00.000Z",
      });
      expect(first).toEqual({ kind: "acquired", itemId: "item-a" });

      await expect(
        repository.claimApiUploadIdempotency({
          apiKeyId: "api-a",
          idempotencyKey: "request-1",
          requestHash: "hash-a",
          candidateItemId: "item-b",
          owner: "owner-b",
          now: "2026-07-05T00:01:00.000Z",
          expiresAt: "2026-07-05T00:16:00.000Z",
        }),
      ).resolves.toEqual({ kind: "in_progress", itemId: "item-a" });

      await expect(
        repository.claimApiUploadIdempotency({
          apiKeyId: "api-a",
          idempotencyKey: "request-1",
          requestHash: "hash-b",
          candidateItemId: "item-c",
          owner: "owner-c",
          now: "2026-07-05T00:02:00.000Z",
          expiresAt: "2026-07-05T00:17:00.000Z",
        }),
      ).resolves.toEqual({ kind: "conflict", itemId: "item-a" });

      await repository.completeApiUploadIdempotency(
        "api-a",
        "request-1",
        "owner-a",
        "2026-07-05T00:03:00.000Z",
        "2026-07-06T00:03:00.000Z",
      );
      await expect(
        repository.claimApiUploadIdempotency({
          apiKeyId: "api-a",
          idempotencyKey: "request-1",
          requestHash: "hash-a",
          candidateItemId: "item-d",
          owner: "owner-d",
          now: "2026-07-05T01:00:00.000Z",
          expiresAt: "2026-07-05T01:15:00.000Z",
        }),
      ).resolves.toEqual({ kind: "completed", itemId: "item-a" });

      await expect(
        repository.claimApiUploadIdempotency({
          apiKeyId: "api-b",
          idempotencyKey: "request-1",
          requestHash: "hash-a",
          candidateItemId: "item-b",
          owner: "owner-b",
          now: "2026-07-05T01:00:00.000Z",
          expiresAt: "2026-07-05T01:15:00.000Z",
        }),
      ).resolves.toEqual({ kind: "acquired", itemId: "item-b" });

      await expect(
        repository.claimApiUploadIdempotency({
          apiKeyId: "api-a",
          idempotencyKey: "request-1",
          requestHash: "hash-new",
          candidateItemId: "item-new",
          owner: "owner-new",
          now: "2026-07-06T00:03:00.000Z",
          expiresAt: "2026-07-06T00:18:00.000Z",
        }),
      ).resolves.toEqual({ kind: "acquired", itemId: "item-new" });

      await repository.abandonApiUploadIdempotency(
        "api-a",
        "request-1",
        "owner-new",
      );
      await expect(
        repository.claimApiUploadIdempotency({
          apiKeyId: "api-a",
          idempotencyKey: "request-1",
          requestHash: "hash-final",
          candidateItemId: "item-final",
          owner: "owner-final",
          now: "2026-07-06T00:04:00.000Z",
          expiresAt: "2026-07-06T00:19:00.000Z",
        }),
      ).resolves.toEqual({ kind: "acquired", itemId: "item-final" });
    } finally {
      db.close();
    }
  });
});

describe("NodeSqliteRepository dashboard stats", () => {
  it("sums bytes for records that have not been deleted", async () => {
    const db = new DatabaseSync(":memory:");
    const repository = new NodeSqliteRepository(db);
    const migrationPath = fileURLToPath(
      new URL("../../../../../migrations/0001_initial.sql", import.meta.url),
    );
    const now = "2026-07-05T00:00:00.000Z";

    try {
      await repository.migrate(migrationPath);
      await repository.createItem({
        item: {
          id: "active",
          title: "Active",
          originalFilename: "active.html",
          slug: "active-a1b2c3d4",
          objectKey: "objects/active/index.html",
          contentType: HTML_CONTENT_TYPE,
          sizeBytes: 1_024,
          sha256: "active-hash",
          visibility: "public",
          status: "active",
          urlExpiresAt: "2026-08-01T00:00:00.000Z",
          fileExpiresAt: "2026-08-01T00:00:00.000Z",
          accessCount: 0,
          lastAccessedAt: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
      });
      await repository.createItem({
        item: {
          id: "deleted",
          title: "Deleted",
          originalFilename: "deleted.html",
          slug: "deleted-a1b2c3d4",
          objectKey: "objects/deleted/index.html",
          contentType: HTML_CONTENT_TYPE,
          sizeBytes: 4_096,
          sha256: "deleted-hash",
          visibility: "public",
          status: "deleted",
          urlExpiresAt: "2026-08-01T00:00:00.000Z",
          fileExpiresAt: "2026-08-01T00:00:00.000Z",
          accessCount: 0,
          lastAccessedAt: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: now,
        },
      });

      await expect(
        repository.getDashboardStats(now, "2026-07-12T00:00:00.000Z"),
      ).resolves.toEqual({
        total: 1,
        totalSizeBytes: 1_024,
        publicCount: 1,
        urlExpired: 0,
        fileDeletingSoon: 0,
        deleted: 1,
      });
    } finally {
      db.close();
    }
  });
});
