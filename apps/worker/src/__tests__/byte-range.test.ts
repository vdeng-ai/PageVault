import { describe, expect, it } from "vitest";
import {
  ifRangeAllowsPartial,
  parseSingleByteRange,
} from "../byte-range.js";

describe("byte ranges", () => {
  it("parses bounded, open-ended, and suffix ranges", () => {
    expect(parseSingleByteRange("bytes=10-19", 100)).toEqual({
      kind: "ok",
      range: { start: 10, end: 19, length: 10 },
    });
    expect(parseSingleByteRange("bytes=90-", 100)).toEqual({
      kind: "ok",
      range: { start: 90, end: 99, length: 10 },
    });
    expect(parseSingleByteRange("bytes=-10", 100)).toEqual({
      kind: "ok",
      range: { start: 90, end: 99, length: 10 },
    });
  });

  it("clamps ranges to the available object size", () => {
    expect(parseSingleByteRange("bytes=95-500", 100)).toEqual({
      kind: "ok",
      range: { start: 95, end: 99, length: 5 },
    });
    expect(parseSingleByteRange("bytes=-500", 100)).toEqual({
      kind: "ok",
      range: { start: 0, end: 99, length: 100 },
    });
  });

  it("rejects unsupported or unsatisfiable ranges", () => {
    for (const value of [
      "items=0-9",
      "bytes=100-",
      "bytes=20-10",
      "bytes=-0",
      "bytes=0-1,5-6",
      "bytes=-",
    ]) {
      expect(parseSingleByteRange(value, 100)).toEqual({
        kind: "unsatisfiable",
      });
    }
    expect(parseSingleByteRange("bytes=0-1", 0)).toEqual({
      kind: "unsatisfiable",
    });
  });

  it("honors matching If-Range validators and rejects stale ones", () => {
    const etag = 'W/"digest-1"';
    const modified = "Tue, 06 Oct 2026 04:00:00 GMT";
    expect(ifRangeAllowsPartial(null, etag, modified)).toBe(true);
    expect(ifRangeAllowsPartial(etag, etag, modified)).toBe(true);
    expect(ifRangeAllowsPartial('W/"digest-2"', etag, modified)).toBe(false);
    expect(
      ifRangeAllowsPartial("Tue, 06 Oct 2026 05:00:00 GMT", etag, modified),
    ).toBe(true);
    expect(
      ifRangeAllowsPartial("Tue, 06 Oct 2026 03:00:00 GMT", etag, modified),
    ).toBe(false);
  });
});
