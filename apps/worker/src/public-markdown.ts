import type { VaultItem, StoredObject } from "@pagevault/core";
import { renderMarkdown } from "@pagevault/core/markdown";
import {
  publicDocument,
  publicHeader,
  escapePublicHtml,
} from "./public-layout.js";
import { publicIcons } from "./public-icons.js";

export function isMarkdownContentType(contentType: string): boolean {
  return /^text\/markdown(?:\s*;|$)/i.test(contentType.trim());
}

export async function renderPublicMarkdownBody(input: {
  item: VaultItem;
  object: StoredObject;
}): Promise<string> {
  const body =
    input.object.body instanceof ArrayBuffer
      ? input.object.body
      : await new Response(input.object.body).arrayBuffer();
  const rendered = renderMarkdown(new TextDecoder().decode(body));
  const headings = rendered.headings.filter(
    (heading) => heading.level >= 2 && heading.level <= 4,
  );
  const toc = headings.length
    ? `<aside class="reader-toc" aria-label="文档目录"><nav class="toc-inner"><h2>目录</h2><ul>${headings.map((heading) => `<li${heading.level > 2 ? ' class="toc-nested"' : ""}><a href="#${escapePublicHtml(encodeURIComponent(heading.id))}">${escapePublicHtml(heading.text)}</a></li>`).join("")}</ul></nav></aside>`
    : "";
  return `<main id="top" class="reader-layout"${headings.length ? "" : ' style="display:block;max-width:960px"'}>${toc}<div class="reader-content"><article class="markdown-body">${rendered.html}</article><footer class="reader-footer"><span>由 PageVault 发布</span><a href="#top">${publicIcons["arrow-up"]}返回顶部</a></footer></div></main>`;
}

export async function renderPublicMarkdownDocument(input: {
  item: VaultItem;
  object: StoredObject;
}): Promise<ArrayBuffer> {
  const html = publicDocument({
    title: input.item.title || "Markdown",
    body: `${publicHeader(true)}${await renderPublicMarkdownBody(input)}`,
  });
  return new TextEncoder().encode(html).buffer;
}
