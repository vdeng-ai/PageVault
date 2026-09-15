import type { HtmlItem, StoredObject } from "@pagevault/core";
import MarkdownIt from "markdown-it";

type MarkdownRenderEnv = {
  headingSlugs?: Set<string>;
  explicitHeadingAnchors?: Map<number, string>;
};

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

markdown.block.ruler.before(
  "paragraph",
  "pagevault_explicit_anchor",
  (state, startLine, _endLine, silent) => {
    const line = state.src.slice(state.bMarks[startLine], state.eMarks[startLine]);
    const anchorId = explicitAnchorId(line);
    if (!anchorId) {
      return false;
    }
    if (silent) {
      return true;
    }

    const token = state.push("pagevault_explicit_anchor", "", 0);
    token.map = [startLine, startLine + 1];
    token.attrSet("id", anchorId);
    state.line = startLine + 1;
    return true;
  },
);

markdown.renderer.rules.pagevault_explicit_anchor = (tokens, index) => {
  const anchorId = tokens[index]?.attrGet("id");
  return anchorId ? `<a id="${escapeHtml(anchorId)}"></a>\n` : "";
};

markdown.renderer.rules.heading_open = (tokens, index, options, env, self) => {
  const inline = tokens[index + 1];
  const headingText =
    inline?.type === "inline" ? inlineTextContent(inline.children ?? []) : "";
  const renderEnv = env as MarkdownRenderEnv;
  const headingLine = tokens[index]?.map?.[0];
  const explicitSlug =
    headingLine === undefined || headingLine === null
      ? undefined
      : renderEnv.explicitHeadingAnchors?.get(headingLine);
  const baseSlug = (explicitSlug ?? headingSlug(headingText)) || "section";
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
  const prepared = prepareMarkdownSource(source);
  const rendered = markdown.render(prepared.source, {
    headingSlugs: new Set<string>(),
    explicitHeadingAnchors: prepared.explicitHeadingAnchors,
  });
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

function prepareMarkdownSource(source: string): {
  source: string;
  explicitHeadingAnchors: Map<number, string>;
} {
  const lines = source.split(/\r?\n/);
  const explicitHeadingAnchors = new Map<number, string>();

  for (let index = 0; index < lines.length; index += 1) {
    const anchorId = explicitAnchorId(lines[index] ?? "");
    if (!anchorId) {
      continue;
    }

    let headingLine = index + 1;
    while (headingLine < lines.length && (lines[headingLine] ?? "").trim() === "") {
      headingLine += 1;
    }
    if (isHeadingAtLine(lines, headingLine)) {
      explicitHeadingAnchors.set(headingLine, anchorId);
      lines[index] = "";
    }
  }

  return {
    source: lines.join("\n"),
    explicitHeadingAnchors,
  };
}

function explicitAnchorId(line: string): string | null {
  const match = line.match(
    /^\s*<a\s+id\s*=\s*(?:"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’)\s*>\s*<\/a>\s*$/i,
  );
  const value = match?.slice(1).find((candidate) => candidate !== undefined);
  if (!value || !/^[\p{L}\p{N}\p{M}._:-]+$/u.test(value)) {
    return null;
  }
  return value;
}

function isHeadingAtLine(lines: string[], line: number): boolean {
  const value = lines[line] ?? "";
  if (/^ {0,3}#{1,6}(?:\s+|$)/.test(value)) {
    return true;
  }
  const underline = lines[line + 1] ?? "";
  return /^ {0,3}(?:=+|-+)\s*$/.test(underline) && value.trim().length > 0;
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
