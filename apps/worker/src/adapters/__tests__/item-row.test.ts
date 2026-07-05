import { describe, expect, it, vi } from "vitest";
import { buildListWhere } from "../item-row.js";

describe("buildListWhere", () => {
  it("matches derived status precedence for url_expired filters", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T00:00:00.000Z"));
    try {
      expect(buildListWhere({ status: "url_expired" })).toEqual({
        whereSql:
          "WHERE status = 'active' AND visibility = 'public' AND file_expires_at > ? AND url_expires_at <= ?",
        values: ["2026-07-05T00:00:00.000Z", "2026-07-05T00:00:00.000Z"]
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("matches derived status precedence for file_expired filters", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T00:00:00.000Z"));
    try {
      expect(buildListWhere({ status: "file_expired" })).toEqual({
        whereSql: "WHERE status = 'active' AND visibility = 'public' AND file_expires_at <= ?",
        values: ["2026-07-05T00:00:00.000Z"]
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
