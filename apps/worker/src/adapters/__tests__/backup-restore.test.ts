import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HTML_CONTENT_TYPE } from "@pagevault/core";
import { describe, expect, it } from "vitest";
import { NodeSqliteRepository } from "../node-db.js";
import { LocalFileStorage } from "../node-storage.js";

describe("local backup and restore", () => {
  it("restores checkpointed SQLite metadata together with object files", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "pagevault-backup-src-"));
    const restoredRoot = await mkdtemp(
      join(tmpdir(), "pagevault-backup-restored-"),
    );
    const sqlitePath = join(sourceRoot, "pagevault.sqlite");
    const objectsDir = join(sourceRoot, "objects");
    const repository = NodeSqliteRepository.open(sqlitePath);
    const storage = new LocalFileStorage(objectsDir);
    const initialMigration = fileURLToPath(
      new URL("../../../../../migrations/0001_initial.sql", import.meta.url),
    );
    const now = "2026-07-05T00:00:00.000Z";
    const objectKey = "objects/backup/index.html";
    const body = new TextEncoder().encode("<h1>backup</h1>");

    try {
      await repository.migrate(initialMigration);
      await repository.createItem({
        item: {
          id: "backup",
          title: "Backup",
          originalFilename: "backup.html",
          slug: "backup-a1b2c3d4",
          objectKey,
          contentType: HTML_CONTENT_TYPE,
          sizeBytes: body.byteLength,
          sha256: "backup-hash",
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
      await storage.putObject(objectKey, body.buffer, HTML_CONTENT_TYPE);
      repository.checkpoint();
      repository.close();

      await cp(sourceRoot, restoredRoot, { recursive: true });

      const restoredRepository = NodeSqliteRepository.open(
        join(restoredRoot, "pagevault.sqlite"),
      );
      const restoredStorage = new LocalFileStorage(
        join(restoredRoot, "objects"),
      );
      try {
        await expect(restoredRepository.getItemById("backup")).resolves.toMatchObject({
          slug: "backup-a1b2c3d4",
          objectKey,
          sizeBytes: body.byteLength,
        });
        const restoredObject = await restoredStorage.getObject(objectKey);
        expect(restoredObject?.size).toBe(body.byteLength);
        expect(
          await new Response(restoredObject?.body ?? new ArrayBuffer(0)).text(),
        ).toBe("<h1>backup</h1>");
      } finally {
        restoredRepository.close();
      }
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(restoredRoot, { recursive: true, force: true });
    }
  });
});
