import { describe, expect, it } from "vitest";
import { formatFileSize } from "./format.js";

describe("formatFileSize", () => {
  it("formats binary units through terabytes", () => {
    expect(formatFileSize(0, "en-US")).toBe("0 B");
    expect(formatFileSize(1_536, "en-US")).toBe("1.5 KB");
    expect(formatFileSize(5 * 1024 ** 3, "en-US")).toBe("5 GB");
  });
});
