import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { HTML_CONTENT_TYPE } from "@pagevault/core";
import { describe, expect, it } from "vitest";
import { NodeSqliteRepository } from "../node-db.js";
import { LocalFileStorage } from "../node-storage.js";

describe("reconciliation adapters", () => {
  it("persists bounded SQLite reconciliation cursors", async () => {
    const db = new DatabaseSync(":memory:");
    const repository = new NodeSqliteRepository(db);
    const initial = fileURLToPath(
      new URL("../../../../../migrations/0001_initial.sql", import.meta.url),
    );
    const maintenance = fileURLToPath(
      new URL(
        "../../../../../migrations/0005_maintenance_state.sql",
        import.meta.url,
      ),
    );
    const now = "2026-07-05T00:00:00.000Z";
    const makeItem = (id: string) => ({
      id,
      title: id,
      originalFilename: id + ".html",
      slug: id + "-a1b2c3d4",
      objectKey: "objects/" + id + "/index.html",
      contentType: HTML_CONTENT_TYPE,
      sizeBytes: 1,
      sha256: "hash-" + id,
      visibility: "public" as const,
      status: "active" as const,
      urlExpiresAt: "2026-08-01T00:00:00.000Z",
      fileExpiresAt: "2026-08-01T00:00:00.000Z",
      accessCount: 0,
      lastAccessedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    try {
      await repository.migrate(initial);
      await repository.migrate(maintenance);
      for (const id of ["a", "b", "c"]) {
        await repository.createItem({ item: makeItem(id) });
      }

      const first = await repository.listItemsForReconciliation(null, 2);
      expect(first.items.map((item) => item.id)).toEqual(["a", "b"]);
      expect(first.nextCursor).toBe("b");

      const second = await repository.listItemsForReconciliation("b", 2);
      expect(second.items.map((item) => item.id)).toEqual(["c"]);
      expect(second.nextCursor).toBeNull();

      await repository.setMaintenanceState(
        "reconciliation.db.cursor",
        "b",
        now,
      );
      await expect(
        repository.getMaintenanceState("reconciliation.db.cursor"),
      ).resolves.toBe("b");
    } finally {
      db.close();
    }
  });

  it("lists local objects in bounded pages and ignores metadata sidecars", async () => {
    const root = await mkdtemp(join(tmpdir(), "pagevault-reconcile-"));
    const storage = new LocalFileStorage(root);
    try {
      for (const id of ["a", "b", "c"]) {
        await storage.putObject(
          "objects/" + id + "/index.html",
          new ArrayBuffer(1),
          HTML_CONTENT_TYPE,
        );
      }

      const first = await storage.listObjects({
        prefix: "objects/",
        limit: 2,
      });
      expect(first.objects.map((object) => object.key)).toEqual([
        "objects/a/index.html",
        "objects/b/index.html",
      ]);
      expect(first.nextCursor).toBe("objects/b/index.html");

      const second = await storage.listObjects({
        prefix: "objects/",
        cursor: first.nextCursor ?? undefined,
        limit: 2,
      });
      expect(second.objects.map((object) => object.key)).toEqual([
        "objects/c/index.html",
      ]);
      expect(second.nextCursor).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
