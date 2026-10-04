import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../markdown.js";

describe("shared Markdown renderer", () => {
  it("keeps explicit and repeated heading anchors consistent with the generated contents list", () => {
    const rendered = renderMarkdown(
      '<a id="custom-anchor"></a>\n\n## 使用说明\n\n## 重复标题\n\n## 重复标题',
    );
    expect(rendered.headings.map((heading) => heading.id)).toEqual([
      "custom-anchor",
      "重复标题",
      "重复标题-1",
    ]);
    expect(rendered.html).toContain('<h2 id="custom-anchor">使用说明</h2>');
    expect(rendered.html).not.toContain("&lt;a id");
  });

  it("escapes HTML and does not create executable script links", () => {
    const rendered = renderMarkdown(
      "<script>alert(1)</script>\n\n## <img src=x onerror=alert(1)>\n\n[click](javascript:alert(1))",
    );
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("<img src=x");
    expect(rendered.html).not.toContain('href="javascript:');
  });

  it("retains safe standalone anchors without visible source text", () => {
    const rendered = renderMarkdown(
      '<a id="“unsafe”"></a>\n\n<a id="safe"></a>\n\nParagraph',
    );
    expect(rendered.html).toContain('<a id="safe"></a>');
    expect(rendered.html).toContain("&lt;a id=");
  });
});
