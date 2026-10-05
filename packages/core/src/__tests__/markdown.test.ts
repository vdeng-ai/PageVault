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

  it("preserves anchor examples inside fenced code blocks", () => {
    const rendered = renderMarkdown(
      '```markdown\n<a id="example"></a>\n## Example\n```\n\n~~~markdown\n<a id="second-example"></a>\n## Second example\n~~~\n\n## Real heading',
    );
    expect(rendered.html).toContain(
      "&lt;a id=&quot;example&quot;&gt;&lt;/a&gt;",
    );
    expect(rendered.html).toContain(
      "&lt;a id=&quot;second-example&quot;&gt;&lt;/a&gt;",
    );
    expect(rendered.headings).toEqual([
      { id: "real-heading", text: "Real heading", level: 2 },
    ]);
  });

  it("keeps standalone anchors and heading IDs unique", () => {
    const rendered = renderMarkdown(
      '<a id="example"></a>\n\nParagraph\n\n## Example',
    );
    expect(rendered.html).toContain('<a id="example"></a>');
    expect(rendered.html).toContain('<h2 id="example-1">Example</h2>');
    expect(rendered.headings[0]?.id).toBe("example-1");
  });

  it("associates explicit anchors with parsed setext and blockquote headings", () => {
    const rendered = renderMarkdown(
      '<a id="setext"></a>\n\nSetext heading\n---\n\n> <a id="quoted"></a>\n> ## Quoted heading',
    );
    expect(rendered.headings.map((h) => h.id)).toEqual(["setext", "quoted"]);
    expect(rendered.html).not.toContain('<a id="setext"></a>');
    expect(rendered.html).not.toContain('<a id="quoted"></a>');
  });
});
