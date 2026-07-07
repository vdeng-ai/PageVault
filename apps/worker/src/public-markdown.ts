import type { HtmlItem, StoredObject } from "@htmlbed/core";
import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

export function isMarkdownContentType(contentType: string): boolean {
  return /^text\/markdown(?:\s*;|$)/i.test(contentType.trim());
}

export async function renderPublicMarkdownDocument(input: {
  item: HtmlItem;
  object: StoredObject;
}): Promise<ArrayBuffer> {
  const body = await objectBodyToArrayBuffer(input.object.body);
  const source = new TextDecoder().decode(body);
  const rendered = markdown.render(source);
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
