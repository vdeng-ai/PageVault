import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
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
