import { describe, expect, it } from "vitest";
import {
  addDays,
  defaultFileExpiresAt,
  defaultUrlExpiresAt,
  isFileExpired,
  isUrlExpired,
} from "../expiry.js";
import { slugifyFilename } from "../slug.js";

describe("slugifyFilename", () => {
  it("handles English filenames", () => {
    expect(slugifyFilename("Product Intro.html")).toBe("product-intro");
  });

  it("preserves Chinese filenames", () => {
    expect(slugifyFilename("产品介绍.html")).toBe("产品介绍");
    expect(slugifyFilename("销售 报告.md")).toBe("销售-报告");
  });

  it("handles empty filenames", () => {
    expect(slugifyFilename(".html")).toBe("html");
  });

  it("collapses special characters", () => {
    expect(slugifyFilename("a---b__c!!.htm")).toBe("a-b-c");
  });

  it("strips supported upload extensions", () => {
    expect(slugifyFilename("hero.image.jpeg")).toBe("hero-image");
    expect(slugifyFilename("archive.tar.webp")).toBe("archive-tar");
  });

  it("limits long filenames", () => {
    expect(slugifyFilename(`${"a".repeat(120)}.html`)).toHaveLength(80);
  });
});

describe("expiry", () => {
  const now = new Date("2026-07-05T00:00:00.000Z");

  it("defaults URL expiry to 7 days", () => {
    expect(defaultUrlExpiresAt(now)).toBe("2026-07-12T00:00:00.000Z");
  });

  it("defaults file expiry to 180 days", () => {
    expect(defaultFileExpiresAt(now)).toBe("2027-01-01T00:00:00.000Z");
  });

  it("detects URL expiry", () => {
    expect(
      isUrlExpired({ urlExpiresAt: addDays(now, -1).toISOString() }, now),
    ).toBe(true);
  });

  it("detects file expiry", () => {
    expect(isFileExpired({ fileExpiresAt: now.toISOString() }, now)).toBe(true);
  });
});
