import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PageVaultService,
  createPageVaultConfig,
  type StorageProvider,
} from "@pagevault/core";
import { mcpFixture } from "./mcp-fixture.js";

type Fixture = Awaited<ReturnType<typeof mcpFixture>>;
const fixtures: Fixture[] = [];
async function fixture() {
  const f = await mcpFixture();
  fixtures.push(f);
  return f;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const f of fixtures.splice(0)) await f.close();
});

async function expiredFiles(f: Fixture, count: number) {
  const now = new Date("2026-11-01T00:00:00.000Z");
  const files = [];
  for (let i = 0; i < count; i += 1) {
    files.push(
      (
        await f.service.uploadFile({
          filename: `file-${i}.md`,
          body: new TextEncoder().encode(`# File ${i}`).buffer,
          fileExpireDays: 1,
          now,
        })
      ).item,
    );
  }
  return files;
}

describe("batched retention and OAuth cleanup", () => {
  it("cleans bounded batches on real SQLite without losing per-file audit records", async () => {
    const f = await fixture();
    const files = await expiredFiles(f, 24);
    const result = await f.service.garbageCollectExpiredFiles(
      new Date("2026-11-16T00:00:00.000Z"),
      20,
    );
    expect(result).toMatchObject({ scanned: 20, deleted: 20, failed: [] });
    expect(
      (
        await f.repository.listItems({
          page: 1,
          pageSize: 100,
          status: "deleted",
        })
      ).items,
    ).toHaveLength(20);
    const recent = await f.repository.getOperationsSummary();
    expect(
      recent.recentAuditEvents.some((event) => event.action === "gc_delete"),
    ).toBe(true);
    for (const file of files.filter((file) =>
      result.deletedSlugs.includes(file.slug),
    )) {
      expect(await f.storage.getObject(file.objectKey)).toBeNull();
    }
    expect(
      (
        await f.service.garbageCollectExpiredFiles(
          new Date("2026-11-16T00:00:00.000Z"),
          20,
        )
      ).deleted,
    ).toBe(4);
  });

  it("does not mark a failed bulk object deletion as completed", async () => {
    const f = await fixture();
    const files = await expiredFiles(f, 2);
    const storage = Object.create(f.storage) as StorageProvider;
    storage.deleteObjects = async () => {
      throw new Error("storage unavailable");
    };
    const service = new PageVaultService(
      f.repository,
      storage,
      createPageVaultConfig({ publicBaseUrl: f.env.PUBLIC_BASE_URL }),
    );
    const result = await service.garbageCollectExpiredFiles(
      new Date("2026-11-16T00:00:00.000Z"),
    );
    expect(result.deleted).toBe(0);
    expect(result.failed).toHaveLength(2);
    for (const file of files)
      expect((await f.repository.getItemById(file.id))?.status).toBe("active");
  });

  it("recovers when metadata failed after objects were removed; audit failure remains best effort", async () => {
    const f = await fixture();
    await expiredFiles(f, 2);
    const write = vi
      .spyOn(f.repository, "markDeletedBatch")
      .mockRejectedValueOnce(new Error("D1 unavailable"));
    const first = await f.service.garbageCollectExpiredFiles(
      new Date("2026-11-16T00:00:00.000Z"),
    );
    expect(first).toMatchObject({ deleted: 0 });
    expect(first.failed).toHaveLength(2);
    write.mockRestore();
    vi.spyOn(f.repository, "writeAuditLogs").mockRejectedValueOnce(
      new Error("audit unavailable"),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const retry = await f.service.garbageCollectExpiredFiles(
      new Date("2026-11-16T00:00:00.000Z"),
    );
    expect(retry).toMatchObject({ deleted: 2, failed: [] });
    expect(log).toHaveBeenCalled();
  });

  it("removes expired OAuth metadata through the same maintenance store", async () => {
    const f = await fixture();
    await f.authorize();
    expect(await f.store.list()).toHaveLength(1);
    await f.store.prune(Date.now() + 31 * 24 * 3600_000);
    expect(await f.store.list()).toEqual([]);
  });
});
