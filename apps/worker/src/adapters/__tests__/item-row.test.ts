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


  it("combines file, time, expiry, and size filters without storage reads", () => {
    expect(
      buildListWhere({
        fileKind: "pdf",
        createdAfter: "2026-06-01T00:00:00.000Z",
        urlExpiresAfter: "2026-07-01T00:00:00.000Z",
        urlExpiresBefore: "2026-07-31T00:00:00.000Z",
        minSizeBytes: 1_048_576,
        maxSizeBytes: 10_485_760,
      }),
    ).toEqual({
      whereSql:
        "WHERE content_type = ? AND created_at >= ? AND url_expires_at >= ? AND url_expires_at <= ? AND size_bytes >= ? AND size_bytes <= ? AND status != 'deleted'",
      values: [
        "application/pdf",
        "2026-06-01T00:00:00.000Z",
        "2026-07-01T00:00:00.000Z",
        "2026-07-31T00:00:00.000Z",
        1_048_576,
        10_485_760,
      ],
    });
  });

  it("maps image file kinds to their exact stored content type", () => {
    expect(buildListWhere({ fileKind: "svg" })).toMatchObject({
      whereSql: "WHERE content_type = ? AND status != 'deleted'",
      values: ["image/svg+xml"],
    });
  });
});
