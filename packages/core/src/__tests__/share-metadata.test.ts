import { describe, expect, it } from "vitest";
import { extractShareMetadata } from "../share-metadata.js";

const bytes = (source: string) => new TextEncoder().encode(source).buffer;

describe("upload share metadata", () => {
  it("prefers Open Graph descriptions and decodes quoted/reordered HTML attributes", () => {
    expect(
      extractShareMetadata(
        "html",
        bytes(`<!doctype html><html><head>
      <TITLE>  发布 &amp; 分享 &#x1f680; </TITLE>
      <meta name="description" content="普通描述">
      <META content='正文 &quot;摘要&quot; &amp; 介绍 > 更多' PROPERTY='og:description'>
      </head><body>Original body</body></html>`),
      ),
    ).toEqual({
      title: "发布 & 分享 🚀",
      description: '正文 "摘要" & 介绍 > 更多',
    });
  });

  it("ignores fake head metadata in comments, scripts, styles, templates and the body", () => {
    expect(
      extractShareMetadata(
        "html",
        bytes(`<head>
      <!-- <title>Comment</title><meta property="og:description" content="comment"> -->
      <script>const fake = '<title>Script</title><meta property="og:description" content="script">';</script>
      <style>/* <meta property="og:description" content="style"> */</style>
      <template><template><title>Template</title></template><meta property="og:description" content="template"></template>
      <title>Actual title</title><meta content="Actual summary" name=description>
      </head><body><meta property="og:description" content="body"></body>`),
      ),
    ).toEqual({
      title: "Actual title",
      description: "Actual summary",
    });
  });

  it("uses the ordinary description when Open Graph is empty and cleans markup/whitespace", () => {
    expect(
      extractShareMetadata(
        "html",
        bytes(`<head>
      <title> \n </title><meta property="og:description" content="  ">
      <meta name=description content="&lt;b&gt;Hello&lt;/b&gt; &#10; world &nbsp; today">
      </head>`),
      ),
    ).toEqual({ title: null, description: "Hello world today" });
  });

  it("extracts the first Markdown heading and body paragraph without formatting or link URLs", () => {
    expect(
      extractShareMetadata(
        "markdown",
        bytes(`---
private: front matter
---

~~~md
# Code heading
Code prose
~~~

# **研发** [周报](https://example.com)

![Cover](cover.png)

> Quoted text

- List text

完成 **上传修复**，查看 [发布说明](https://example.com/release)。
保留 \`原文件\`。

Second paragraph.`),
      ),
    ).toEqual({
      title: "研发 周报",
      description: "完成 上传修复，查看 发布说明。 保留 原文件。",
    });
  });

  it("supports Setext headings and skips HTML blocks in Markdown", () => {
    expect(
      extractShareMetadata(
        "markdown",
        bytes(`<script>private script</script>

Readable &amp; title
====================

Text with <b>inline HTML</b> and \`code\`.`),
      ),
    ).toEqual({
      title: "Readable & title",
      description: "Text with inline HTML and code.",
    });
  });

  it("limits titles to 200 UTF-16 units and descriptions to 120 Unicode characters without splitting emoji", () => {
    const result = extractShareMetadata(
      "html",
      bytes(`<title>${"🚀".repeat(250)}</title>
      <meta name="description" content="${"中🚀".repeat(100)}">`),
    );
    expect(result.title).toBe("🚀".repeat(100));
    expect(result.description).toBe("中🚀".repeat(60));
  });

  it("bounds parsing at 64 KiB and ignores incomplete tags and UTF-8 lines", () => {
    const padding = " ".repeat(64 * 1024);
    expect(
      extractShareMetadata("html", bytes(`${padding}<title>Too late</title>`)),
    ).toEqual({ title: null, description: null });
    expect(
      extractShareMetadata(
        "html",
        bytes(
          `${" ".repeat(65520)}<meta name="description" content="unfinished">`,
        ),
      ).description,
    ).toBeNull();
    expect(
      extractShareMetadata(
        "markdown",
        bytes(`# Title\n\n${"中".repeat(30000)}`),
      ),
    ).toEqual({ title: "Title", description: null });
    expect(
      extractShareMetadata(
        "markdown",
        bytes(`---\n${padding}\n---\n# Too late`),
      ),
    ).toEqual({ title: null, description: null });
  });

  it("leaves absent metadata and non-text formats on the existing fallback", () => {
    expect(
      extractShareMetadata("html", bytes("<h1>No title element</h1>")),
    ).toEqual({ title: null, description: null });
    expect(extractShareMetadata("markdown", bytes("# Heading only"))).toEqual({
      title: "Heading only",
      description: null,
    });
    for (const kind of ["pdf", "svg", "png", "jpeg", "webp"] as const) {
      expect(
        extractShareMetadata(kind, bytes("<title>Ignore</title>")),
      ).toEqual({ title: null, description: null });
    }
  });
});
