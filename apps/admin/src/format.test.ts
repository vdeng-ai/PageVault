import { describe, expect, it } from "vitest";
import { encodeShareUrl, formatFileSize, itemPreviewUrl } from "./format.js";

describe("itemPreviewUrl", () => {
  it("uses the authenticated admin route only for private files", () => {
    const item = {
      id: "file/with space",
      publicUrl: "https://public.test/p/file",
    };
    expect(itemPreviewUrl({ ...item, visibility: "public" })).toBe(
      item.publicUrl,
    );
    expect(itemPreviewUrl({ ...item, visibility: "private" })).toBe(
      "/api/admin/items/file%2Fwith%20space/preview",
    );
  });
});

describe("encodeShareUrl", () => {
  it("percent-encodes non-ASCII path segments without changing the URL structure", () => {
    expect(encodeShareUrl("https://html.example/测试-ab12?x=中文#片段")).toBe(
      "https://html.example/%E6%B5%8B%E8%AF%95-ab12?x=%E4%B8%AD%E6%96%87#%E7%89%87%E6%AE%B5",
    );
  });
});

describe("formatFileSize", () => {
  it("formats binary units through terabytes", () => {
    expect(formatFileSize(0, "en-US")).toBe("0 B");
    expect(formatFileSize(1_536, "en-US")).toBe("1.5 KB");
    expect(formatFileSize(5 * 1024 ** 3, "en-US")).toBe("5 GB");
  });
});
