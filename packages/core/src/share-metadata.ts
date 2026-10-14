import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type { FileKind } from "./file-types.js";

// Upload-time work only: never parse an entire large document for a preview.
const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 120;
const markdown = new MarkdownIt({ html: true, linkify: false });

export interface ShareMetadata {
  title: string | null;
  description: string | null;
}

function plainText(value: string, limit: number): string | null {
  const clean = value
    .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
    .replace(/<\/?[a-z][^<>]*>/gi, " ")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(clean).slice(0, limit).join("") || null;
}

function titleText(value: string): string | null {
  // Match the existing title editor/API's 200 UTF-16-unit limit, while
  // preserving complete characters at the boundary.
  return (
    plainText(value, MAX_TITLE_LENGTH)
      ?.slice(0, MAX_TITLE_LENGTH)
      .replace(/[\uD800-\uDBFF]$/u, "") || null
  );
}

function decodeEntities(value: string): string {
  // Reuse the existing Markdown parser's HTML entity decoder, without
  // interpreting Markdown backslash escapes in HTML metadata.
  return value.replace(
    /&(?:#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g,
    (entity) => markdown.utils.unescapeAll(entity),
  );
}

function attributes(source: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of source.matchAll(
    /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
  )) {
    const name = match[1]!.toLowerCase();
    if (!result.has(name)) {
      result.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ""));
    }
  }
  return result;
}

function htmlMetadata(source: string): ShareMetadata {
  let title: string | null = null;
  let ogDescription: string | null = null;
  let description: string | null = null;
  let cursor = 0;
  let templateDepth = 0;
  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start < 0) break;
    if (source.startsWith("<!--", start)) {
      const end = source.indexOf("-->", start + 4);
      cursor = end < 0 ? source.length : end + 3;
      continue;
    }
    // Find the tag end in one pass, allowing '>' inside quoted attributes.
    let quote = "";
    let end = start + 1;
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
    }
    if (end === source.length) break;
    cursor = end + 1;
    const tag = source
      .slice(start + 1, end)
      .match(/^(\/)?([a-z][\w:-]*)([\s\S]*)$/i);
    if (!tag) continue;
    const closing = Boolean(tag[1]);
    const name = tag[2]!.toLowerCase();
    if (name === "template") {
      templateDepth = Math.max(0, templateDepth + (closing ? -1 : 1));
      continue;
    }
    if (!closing && ["script", "style", "noscript", "title"].includes(name)) {
      const close = new RegExp(`</${name}\\s*>`, "gi");
      close.lastIndex = cursor;
      const match = close.exec(source);
      if (!match) break;
      if (name === "title" && !templateDepth && !title) {
        title = titleText(decodeEntities(source.slice(cursor, match.index)));
      }
      cursor = close.lastIndex;
      continue;
    }
    if (templateDepth) continue;
    if (name === "body" || (closing && name === "head")) break;
    if (!closing && !["html", "head", "meta", "link", "base"].includes(name))
      break;
    if (name !== "meta" || closing) continue;
    const attrs = attributes(tag[3]!);
    const content = plainText(
      attrs.get("content") ?? "",
      MAX_DESCRIPTION_LENGTH,
    );
    if (attrs.get("property")?.toLowerCase() === "og:description") {
      ogDescription ??= content;
    }
    if (attrs.get("name")?.toLowerCase() === "description") {
      description ??= content;
    }
  }
  return { title, description: ogDescription ?? description };
}

function inlineText(tokens: Token[]): string {
  return tokens
    .map((token) => {
      if (token.type === "image" || token.type === "html_inline") return "";
      if (token.type === "softbreak" || token.type === "hardbreak") return " ";
      if (token.children) return inlineText(token.children);
      return token.type === "text" || token.type === "code_inline"
        ? token.content
        : "";
    })
    .join("");
}

function markdownMetadata(source: string, truncated: boolean): ShareMetadata {
  // Ignore conventional YAML front matter rather than treating it as prose.
  const frontMatter = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;
  if (truncated && /^---\r?\n/.test(source) && !frontMatter.test(source)) {
    return { title: null, description: null };
  }
  const content = source.replace(frontMatter, "");
  const tokens = markdown.parse(content, {});
  let title: string | null = null;
  let description: string | null = null;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const inline = tokens[index + 1];
    if (inline?.type !== "inline") continue;
    if (token.type === "heading_open" && token.level === 0 && !title) {
      title = titleText(inlineText(inline.children ?? []));
    }
    if (token.type === "paragraph_open" && token.level === 0 && !description) {
      description = plainText(
        inlineText(inline.children ?? []),
        MAX_DESCRIPTION_LENGTH,
      );
    }
    if (title && description) break;
  }
  return { title, description };
}

export function extractShareMetadata(
  kind: FileKind,
  body: ArrayBuffer,
): ShareMetadata {
  if (kind !== "html" && kind !== "markdown") {
    return { title: null, description: null };
  }
  // Streaming decode omits a partial UTF-8 character at the byte boundary.
  const truncated = body.byteLength > MAX_SOURCE_BYTES;
  let source = new TextDecoder().decode(
    new Uint8Array(body, 0, Math.min(body.byteLength, MAX_SOURCE_BYTES)),
    { stream: truncated },
  );
  if (truncated && kind === "markdown") {
    // Do not turn an incomplete final line/link into preview text.
    source = source.slice(0, Math.max(0, source.lastIndexOf("\n")));
  }
  return kind === "html"
    ? htmlMetadata(source)
    : markdownMetadata(source, truncated);
}
