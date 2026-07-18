import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { HTML_CONTENT_TYPE } from "@pagevault/core";
import { describe, expect, it } from "vitest";
import { NodeSqliteRepository } from "../node-db.js";

describe("NodeSqliteRepository API upload lease", () => {
  it("applies the migration idempotently and preserves lease ownership", async () => {
    const db = new DatabaseSync(":memory:");
    const repository = new NodeSqliteRepository(db);
    const migrationPath = resolve(
      process.cwd(),
      "migrations/0003_api_upload_lock.sql",
    );

    try {
      await repository.migrate(migrationPath);
      await repository.migrate(migrationPath);

      await expect(
        repository.tryAcquireApiUploadLease(
          "owner-a",
          "2026-07-05T00:15:00.000Z",
          "2026-07-05T00:00:00.000Z",
        ),
      ).resolves.toBe(true);
      await expect(
        repository.tryAcquireApiUploadLease(
          "owner-b",
          "2026-07-05T00:16:00.000Z",
          "2026-07-05T00:01:00.000Z",
        ),
      ).resolves.toBe(false);

      await expect(
        repository.tryAcquireApiUploadLease(
          "owner-b",
          "2026-07-05T00:30:00.000Z",
          "2026-07-05T00:15:00.000Z",
        ),
      ).resolves.toBe(true);
      await repository.releaseApiUploadLease("owner-a");
      await expect(
        repository.tryAcquireApiUploadLease(
          "owner-c",
          "2026-07-05T00:31:00.000Z",
          "2026-07-05T00:16:00.000Z",
        ),
      ).resolves.toBe(false);

      await repository.releaseApiUploadLease("owner-b");
      await expect(
        repository.tryAcquireApiUploadLease(
          "owner-c",
          "2026-07-05T00:31:00.000Z",
          "2026-07-05T00:16:00.000Z",
        ),
      ).resolves.toBe(true);
    } finally {
      db.close();
    }
  });
});

describe("NodeSqliteRepository dashboard stats", () => {
  it("sums bytes for records that have not been deleted", async () => {
    const db = new DatabaseSync(":memory:");
    const repository = new NodeSqliteRepository(db);
    const migrationPath = resolve(process.cwd(), "migrations/0001_initial.sql");
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
