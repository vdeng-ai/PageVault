import MarkdownIt from "markdown-it";

export type MarkdownHeading = { id: string; text: string; level: number };

export function renderMarkdown(source: string): {
  html: string;
  headings: MarkdownHeading[];
} {
  const env: MarkdownRenderEnv = {
    headingSlugs: new Set<string>(),
    headings: [],
  };
  // Associate parsed blocks so anchor-like text in code examples stays intact.
  const tokens = markdown.parse(source, env);
  for (let index = 0; index < tokens.length; index += 1) {
    const anchor = tokens[index];
    const heading = tokens[index + 1];
    if (
      anchor?.type === "pagevault_explicit_anchor" &&
      heading?.type === "heading_open"
    ) {
      const id = anchor.attrGet("id");
      if (id) {
        heading.attrSet("id", id);
        anchor.hidden = true;
      }
    }
  }
  return {
    html: markdown.renderer.render(tokens, markdown.options, env),
    headings: env.headings ?? [],
  };
}

type MarkdownRenderEnv = {
  headingSlugs?: Set<string>;
  headings?: MarkdownHeading[];
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
    const line = state.src.slice(
      state.bMarks[startLine],
      state.eMarks[startLine],
    );
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

markdown.renderer.rules.pagevault_explicit_anchor = (
  tokens,
  index,
  _options,
  env,
) => {
  const token = tokens[index];
  const anchorId = token?.attrGet("id");
  if (!anchorId || token?.hidden) return "";
  const id = uniqueSlug(anchorId, env as MarkdownRenderEnv);
  return `<a id="${escapeHtml(id)}"></a>\n`;
};

markdown.renderer.rules.heading_open = (tokens, index, options, env, self) => {
  const inline = tokens[index + 1];
  const headingText =
    inline?.type === "inline" ? inlineTextContent(inline.children ?? []) : "";
  const renderEnv = env as MarkdownRenderEnv;
  const explicitSlug = tokens[index]?.attrGet("id");
  const baseSlug = (explicitSlug ?? headingSlug(headingText)) || "section";
  const slug = uniqueSlug(baseSlug, renderEnv);
  tokens[index]?.attrSet("id", slug);
  (renderEnv.headings ??= []).push({
    id: slug,
    text: headingText,
    level: Number(tokens[index]?.tag.slice(1)),
  });
  return self.renderToken(tokens, index, options);
};

function uniqueSlug(baseSlug: string, env: MarkdownRenderEnv): string {
  const usedSlugs = (env.headingSlugs ??= new Set<string>());
  let slug = baseSlug;
  let suffix = 1;
  while (usedSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
  usedSlugs.add(slug);
  return slug;
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

function inlineTextContent(
  tokens: Array<{ type: string; content: string }>,
): string {
  return tokens
    .filter((token) => ["text", "code_inline", "image"].includes(token.type))
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
