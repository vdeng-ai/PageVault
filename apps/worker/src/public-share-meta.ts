import type { HtmlItem, StoredObject } from "@pagevault/core";

const SHARE_META_MAX_BYTES = 10 * 1024 * 1024;
const DESCRIPTION_MAX_CHARS = 180;
const SITE_NAME = "PageVault";

type PublicResponseBody = ArrayBuffer | ReadableStream | string;

interface HeadSlice {
  content: string;
  closeIndex: number;
}

interface ExistingShareTags {
  title: boolean;
  description: boolean;
  canonical: boolean;
  ogTitle: boolean;
  ogDescription: boolean;
  ogUrl: boolean;
  ogSiteName: boolean;
  ogType: boolean;
  ogImage: boolean;
  twitterCard: boolean;
  twitterTitle: boolean;
  twitterDescription: boolean;
  twitterImage: boolean;
}

interface ShareMetadata {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string | null;
  existing: ExistingShareTags;
}

const EMPTY_EXISTING_TAGS: ExistingShareTags = {
  title: false,
  description: false,
  canonical: false,
  ogTitle: false,
  ogDescription: false,
  ogUrl: false,
  ogSiteName: false,
  ogType: false,
  ogImage: false,
  twitterCard: false,
  twitterTitle: false,
  twitterDescription: false,
  twitterImage: false,
};

export async function decoratePublicHtmlForShare(input: {
  item: HtmlItem;
  object: StoredObject;
  contentType: string;
  publicUrl: string;
}): Promise<PublicResponseBody> {
  if (!isHtmlContentType(input.contentType)) {
    return input.object.body;
  }

  const size = objectBodySize(input.object);
  if (size === null || size > SHARE_META_MAX_BYTES) {
    return input.object.body;
  }

  const body = await objectBodyToArrayBuffer(input.object.body);
  try {
    const html = new TextDecoder().decode(body);
    const head = findHead(html);
    if (!head) {
      return body;
    }

    const metadata = extractShareMetadata(
      html,
      head,
      input.item,
      input.publicUrl,
    );
    const markup = buildShareMarkup(metadata);
    if (markup.length === 0) {
      return body;
    }
    return `${html.slice(0, head.closeIndex)}${markup}${html.slice(head.closeIndex)}`;
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "public share metadata failed",
        itemId: input.item.id,
        slug: input.item.slug,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return body;
  }
}

function isHtmlContentType(contentType: string): boolean {
  return /^text\/html(?:\s*;|$)/i.test(contentType.trim());
}

function objectBodySize(object: StoredObject): number | null {
  if (typeof object.size === "number" && Number.isFinite(object.size)) {
    return object.size;
  }
  if (object.body instanceof ArrayBuffer) {
    return object.body.byteLength;
  }
  return null;
}

async function objectBodyToArrayBuffer(
  body: StoredObject["body"],
): Promise<ArrayBuffer> {
  if (body instanceof ArrayBuffer) {
    return body;
  }
  return new Response(body).arrayBuffer();
}

function findHead(html: string): HeadSlice | null {
  const open = /<head\b[^>]*>/i.exec(html);
  if (!open) {
    return null;
  }

  const contentStart = open.index + open[0].length;
  const tail = html.slice(contentStart);
  const close = /<\/head\s*>/i.exec(tail);
  if (!close) {
    return null;
  }

  const closeIndex = contentStart + close.index;
  return {
    content: html.slice(contentStart, closeIndex),
    closeIndex,
  };
}

function extractShareMetadata(
  html: string,
  head: HeadSlice,
  item: HtmlItem,
  publicUrl: string,
): ShareMetadata {
  const existing = { ...EMPTY_EXISTING_TAGS };
  const meta = extractHeadMeta(head.content, existing);
  const documentTitle = extractTitle(head.content);
  existing.title = Boolean(documentTitle);

  const canonical = extractCanonical(head.content);
  existing.canonical = Boolean(canonical);

  const title =
    meta.ogTitle || documentTitle || normalizeText(item.title) || "HTML";
  const bodySummary = extractBodySummary(html, title);
  const description = truncateText(
    meta.ogDescription ||
      meta.description ||
      bodySummary ||
      normalizeText(item.title) ||
      title,
    DESCRIPTION_MAX_CHARS,
  );
  const imageUrl =
    meta.ogImage || meta.twitterImage || extractFirstAbsoluteImage(html);

  return {
    title,
    description,
    canonicalUrl: canonical || publicUrl,
    imageUrl,
    existing,
  };
}

function extractHeadMeta(
  head: string,
  existing: ExistingShareTags,
): {
  description: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  twitterImage: string | null;
} {
  const values = {
    description: null as string | null,
    ogTitle: null as string | null,
    ogDescription: null as string | null,
    ogImage: null as string | null,
    twitterImage: null as string | null,
  };

  for (const tag of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(tag[0]);
    const content = normalizeText(attrs.content ?? "");
    if (content.length === 0) {
      continue;
    }

    const name = (attrs.name ?? "").toLowerCase();
    const property = (attrs.property ?? "").toLowerCase();
    if (name === "description") {
      existing.description = true;
      values.description ??= content;
    } else if (name === "twitter:card") {
      existing.twitterCard = true;
    } else if (name === "twitter:title") {
      existing.twitterTitle = true;
    } else if (name === "twitter:description") {
      existing.twitterDescription = true;
    } else if (name === "twitter:image") {
      existing.twitterImage = true;
      values.twitterImage ??= isAbsoluteHttpUrl(content) ? content : null;
    }

    if (property === "og:title") {
      existing.ogTitle = true;
      values.ogTitle ??= content;
    } else if (property === "og:description") {
      existing.ogDescription = true;
      values.ogDescription ??= content;
    } else if (property === "og:url") {
      existing.ogUrl = true;
    } else if (property === "og:site_name") {
      existing.ogSiteName = true;
    } else if (property === "og:type") {
      existing.ogType = true;
    } else if (property === "og:image") {
      existing.ogImage = true;
      values.ogImage ??= isAbsoluteHttpUrl(content) ? content : null;
    }
  }

  return values;
}

function extractTitle(head: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(head);
  if (!match?.[1]) {
    return null;
  }
  const title = normalizeText(stripTags(match[1]));
  return title.length > 0 ? title : null;
}

function extractCanonical(head: string): string | null {
  for (const tag of head.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseAttributes(tag[0]);
    const rel = normalizeText(attrs.rel ?? "").toLowerCase();
    const href = normalizeText(attrs.href ?? "");
    if (rel.split(/\s+/).includes("canonical") && href.length > 0) {
      return href;
    }
  }
  return null;
}

function extractBodySummary(html: string, title: string): string | null {
  const body = extractBody(html);
  const parts: string[] = [];
  const normalizedTitle = normalizeForComparison(title);

  for (const match of body.matchAll(
    /<(h1|h2|p|li)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi,
  )) {
    const text = normalizeText(stripTags(match[2] ?? ""));
    if (text.length === 0 || normalizeForComparison(text) === normalizedTitle) {
      continue;
    }
    parts.push(text);
    if (Array.from(parts.join(" ")).length >= DESCRIPTION_MAX_CHARS) {
      break;
    }
  }

  const summary = truncateText(parts.join(" "), DESCRIPTION_MAX_CHARS);
  return summary.length > 0 ? summary : null;
}

function extractBody(html: string): string {
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html);
  if (bodyMatch?.[1]) {
    return bodyMatch[1];
  }
  const head = findHead(html);
  return head ? html.slice(head.closeIndex) : html;
}

function extractFirstAbsoluteImage(html: string): string | null {
  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = parseAttributes(tag[0]);
    const src = normalizeText(attrs.src ?? "");
    if (isAbsoluteHttpUrl(src)) {
      return src;
    }
  }
  return null;
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(
    /([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g,
  )) {
    const name = match[1]?.toLowerCase();
    if (!name) {
      continue;
    }
    attrs[name] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function stripTags(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ");
}

function normalizeText(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function normalizeForComparison(value: string): string {
  return normalizeText(value).toLowerCase();
}

function truncateText(value: string, maxChars: number): string {
  const text = normalizeText(value);
  const chars = Array.from(text);
  if (chars.length <= maxChars) {
    return text;
  }
  const suffix = "...";
  return `${chars
    .slice(0, Math.max(0, maxChars - suffix.length))
    .join("")
    .trimEnd()}${suffix}`;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return htmlEntityCodePoint(codePoint);
    })
    .replace(/&#([0-9]+);?/g, (_match, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      return htmlEntityCodePoint(codePoint);
    })
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

function htmlEntityCodePoint(codePoint: number): string {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return "";
  }
  return String.fromCodePoint(codePoint);
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function buildShareMarkup(metadata: ShareMetadata): string {
  const lines: string[] = [];
  const { existing } = metadata;

  if (!existing.title) {
    lines.push(`<title>${escapeHtmlText(metadata.title)}</title>`);
  }
  if (!existing.description) {
    lines.push(metaName("description", metadata.description));
  }
  if (!existing.ogType) {
    lines.push(metaProperty("og:type", "website"));
  }
  if (!existing.ogTitle) {
    lines.push(metaProperty("og:title", metadata.title));
  }
  if (!existing.ogDescription) {
    lines.push(metaProperty("og:description", metadata.description));
  }
  if (!existing.ogUrl) {
    lines.push(metaProperty("og:url", metadata.canonicalUrl));
  }
  if (!existing.ogSiteName) {
    lines.push(metaProperty("og:site_name", SITE_NAME));
  }
  if (!existing.canonical) {
    lines.push(
      `<link rel="canonical" href="${escapeHtmlAttribute(metadata.canonicalUrl)}">`,
    );
  }
  if (!existing.twitterCard) {
    lines.push(
      metaName(
        "twitter:card",
        metadata.imageUrl ? "summary_large_image" : "summary",
      ),
    );
  }
  if (!existing.twitterTitle) {
    lines.push(metaName("twitter:title", metadata.title));
  }
  if (!existing.twitterDescription) {
    lines.push(metaName("twitter:description", metadata.description));
  }
  if (metadata.imageUrl && !existing.ogImage) {
    lines.push(metaProperty("og:image", metadata.imageUrl));
  }
  if (metadata.imageUrl && !existing.twitterImage) {
    lines.push(metaName("twitter:image", metadata.imageUrl));
  }

  return lines.length > 0 ? `\n  ${lines.join("\n  ")}\n` : "";
}

function metaName(name: string, content: string): string {
  return `<meta name="${name}" content="${escapeHtmlAttribute(content)}">`;
}

function metaProperty(property: string, content: string): string {
  return `<meta property="${property}" content="${escapeHtmlAttribute(content)}">`;
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replace(/"/g, "&quot;");
}
