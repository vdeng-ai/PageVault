import { describe, expect, it } from "vitest";
import {
  publicErrorPage,
  publicSvgHeaders,
  SVG_DOCUMENT_CONTENT_SECURITY_POLICY,
} from "../middleware/security-headers.js";
import { publicDocument } from "../public-layout.js";

describe("public document chrome", () => {
  it.each([403, 404, 410] as const)(
    "keeps status %s and omits private admin navigation",
    async (status) => {
      const response = publicErrorPage(status);
      const body = await response.text();
      expect(response.status).toBe(status);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(body).toContain("此链接暂时无法打开");
      expect(body).toContain("data-theme-toggle");
      expect(body).not.toContain("内容管理");
    },
  );
  it("locks down SVG documents while keeping browser preview inline", () => {
    const headers = publicSvgHeaders("image/svg+xml");
    expect(headers["Content-Disposition"]).toBe("inline");
    expect(headers["Content-Security-Policy"]).toBe(
      SVG_DOCUMENT_CONTENT_SECURITY_POLICY,
    );
    expect(headers["Content-Security-Policy"]).toContain("sandbox");
    expect(headers["Content-Security-Policy"]).toContain("default-src 'none'");
    expect(headers["Content-Security-Policy"]).not.toContain("allow-scripts");
    expect(publicSvgHeaders("image/png")).toEqual({});
  });

  it("escapes document titles without changing the document body", () => {
    const html = publicDocument({
      title: "</title><script>alert(1)</script>",
      body: "<main>Safe</main>",
    });
    expect(html).toContain("&lt;/title&gt;&lt;script&gt;");
    expect(html).toContain("<main>Safe</main>");
  });
});
