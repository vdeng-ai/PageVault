import { describe, expect, it } from "vitest";
import { auditStatements, deletionStatements } from "../sql-batches.js";
import { CloudflareR2Storage } from "../cloudflare-storage.js";

describe("set-based retention SQL", () => {
  it("deletes 500 metadata records with six statements, not 500", () => {
    const ids = Array.from({ length: 500 }, (_, i) => `item-${i}`);
    const queries = deletionStatements(ids, "2026-11-16T00:00:00.000Z");
    expect(queries).toHaveLength(6);
    expect(queries.flatMap((query) => query.values.slice(2))).toEqual(ids);
    for (const query of queries) {
      expect(query.values.length).toBeLessThanOrEqual(100);
      expect(query.sql.match(/\?/g)?.length).toBe(query.values.length);
    }
  });
  it("writes 500 per-file audit entries with 25 statements and nullable fields", () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      id: `log-${i}`,
      action: "gc_delete",
      createdAt: "2026-11-16T00:00:00.000Z",
    }));
    const queries = auditStatements(rows);
    expect(queries).toHaveLength(25);
    expect(queries[0]?.values.slice(0, 5)).toEqual([
      "log-0",
      null,
      "gc_delete",
      null,
      rows[0]?.createdAt,
    ]);
    for (const query of queries) {
      expect(query.values).toHaveLength(100);
      expect(query.sql.match(/\?/g)).toHaveLength(100);
    }
    expect(auditStatements([])).toEqual([]);
    expect(deletionStatements([], "now")).toEqual([]);
  });
  it("passes the full bounded batch to R2 in one call", async () => {
    const calls: (string | string[])[] = [];
    const storage = new CloudflareR2Storage({
      delete: async (keys: string | string[]) => {
        calls.push(keys);
      },
    } as R2Bucket);
    const keys = Array.from({ length: 500 }, (_, i) => `objects/${i}`);
    await storage.deleteObjects(keys);
    await storage.deleteObjects([]);
    expect(calls).toEqual([keys]);
  });
});
