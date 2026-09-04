import type { HtmlItem, StoredObject } from "@pagevault/core";
import MarkdownIt from "markdown-it";

type MarkdownRenderEnv = {
  headingSlugs?: Set<string>;
};

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

markdown.renderer.rules.heading_open = (tokens, index, options, env, self) => {
  const inline = tokens[index + 1];
  const headingText =
    inline?.type === "inline" ? inlineTextContent(inline.children ?? []) : "";
  const baseSlug = headingSlug(headingText) || "section";
  const renderEnv = env as MarkdownRenderEnv;
  const usedSlugs = (renderEnv.headingSlugs ??= new Set<string>());
  let slug = baseSlug;
  let suffix = 1;
  while (usedSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
  usedSlugs.add(slug);
  tokens[index]?.attrSet("id", slug);
  return self.renderToken(tokens, index, options);
};

export function isMarkdownContentType(contentType: string): boolean {
  return /^text\/markdown(?:\s*;|$)/i.test(contentType.trim());
}

export async function renderPublicMarkdownDocument(input: {
  item: HtmlItem;
  object: StoredObject;
}): Promise<ArrayBuffer> {
  const body = await objectBodyToArrayBuffer(input.object.body);
  const source = new TextDecoder().decode(body);
  const rendered = markdown.render(source, { headingSlugs: new Set<string>() });
  const title = escapeHtml(input.item.title || "Markdown");
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root {
      color: #1f2937;
      background: #f8fafc;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.6;
    }
    body {
      margin: 0;
    }
    main {
      max-width: 760px;
      margin: 0 auto;
      padding: 48px 20px 72px;
      background: #ffffff;
      min-height: 100vh;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    pre {
      overflow-x: auto;
      padding: 16px;
      background: #f1f5f9;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }
  </style>
</head>
<body>
  <main>${rendered}</main>
</body>
</html>`;
  return new TextEncoder().encode(html).buffer;
}

function inlineTextContent(tokens: Array<{ type: string; content: string }>): string {
  return tokens
    .filter((token) =>
      ["text", "code_inline", "image"].includes(token.type),
    )
    .map((token) => token.content)
    .join("");
}

function headingSlug(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s+/g, "-");
}

async function objectBodyToArrayBuffer(
  body: StoredObject["body"],
): Promise<ArrayBuffer> {
  if (body instanceof ArrayBuffer) {
    return body;
  }
  return new Response(body).arrayBuffer();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
