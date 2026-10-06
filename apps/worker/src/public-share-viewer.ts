import {
  fileCapabilityForContentType,
  type StoredObject,
  type VaultItem,
} from "@pagevault/core";
import {
  escapePublicHtml,
  publicDocument,
  publicHeader,
} from "./public-layout.js";
import {
  isMarkdownContentType,
  renderPublicMarkdownBody,
} from "./public-markdown.js";

function escapeAttribute(value: string): string {
  return escapePublicHtml(value);
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function shareDescription(item: VaultItem, label: string): string {
  return `${label} · ${formatFileSize(item.sizeBytes)} · 由 PageVault 分享`;
}

function shareHead(input: {
  item: VaultItem;
  publicUrl: string;
  rawUrl: string;
  label: string;
  imagePreview: boolean;
}): string {
  const title = escapeAttribute(input.item.title || input.item.originalFilename);
  const description = escapeAttribute(
    shareDescription(input.item, input.label),
  );
  const publicUrl = escapeAttribute(input.publicUrl);
  const rawUrl = escapeAttribute(input.rawUrl);
  const imageTags = input.imagePreview
    ? `<meta property="og:image" content="${rawUrl}"><meta name="twitter:image" content="${rawUrl}">`
    : "";
  const twitterCard = input.imagePreview ? "summary_large_image" : "summary";
  return [
    `<meta name="description" content="${description}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${publicUrl}">`,
    '<meta property="og:site_name" content="PageVault">',
    `<link rel="canonical" href="${publicUrl}">`,
    `<meta name="twitter:card" content="${twitterCard}">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    imageTags,
  ].join("");
}

function iframeViewer(rawUrl: string, title: string, sandbox: boolean): string {
  return `<section class="share-viewer-stage"><iframe class="share-viewer-frame" src="${escapeAttribute(rawUrl)}" title="${escapeAttribute(title)}" referrerpolicy="no-referrer"${sandbox ? ' sandbox="allow-scripts"' : ""}></iframe></section>`;
}

function imageViewer(rawUrl: string, title: string): string {
  return `<section class="share-viewer-stage share-viewer-image-wrap"><img class="share-viewer-image" src="${escapeAttribute(rawUrl)}" alt="${escapeAttribute(title)}"></section>`;
}

export async function renderPublicShareViewer(input: {
  item: VaultItem;
  publicUrl: string;
  rawUrl: string;
  markdownObject?: StoredObject | null;
}): Promise<string> {
  const capability = fileCapabilityForContentType(input.item.contentType);
  const label = capability?.label ?? "File";
  const title = input.item.title || input.item.originalFilename;
  const isMarkdown = isMarkdownContentType(input.item.contentType);
  const isImage =
    capability?.kind === "jpeg" ||
    capability?.kind === "png" ||
    capability?.kind === "svg" ||
    capability?.kind === "webp";

  let viewer: string;
  if (isMarkdown && input.markdownObject) {
    viewer = `<section class="share-viewer-markdown">${await renderPublicMarkdownBody({
      item: input.item,
      object: input.markdownObject,
    })}</section>`;
  } else if (capability?.kind === "html") {
    viewer = iframeViewer(input.rawUrl, title, true);
  } else if (capability?.kind === "pdf") {
    viewer = iframeViewer(input.rawUrl, title, false);
  } else if (isImage) {
    viewer = imageViewer(input.rawUrl, title);
  } else {
    viewer = `<section class="share-viewer-stage share-viewer-fallback"><div><p>当前文件可直接打开原文件查看。</p><a class="share-viewer-open" href="${escapeAttribute(input.rawUrl)}" target="_blank" rel="noreferrer">打开原文件</a></div></section>`;
  }

  const body = `${publicHeader(true)}<main class="share-viewer-shell"><section class="share-viewer-meta"><div class="share-viewer-copy"><p class="share-viewer-eyebrow">${escapePublicHtml(label)}</p><h1 class="share-viewer-title">${escapePublicHtml(title)}</h1><p class="share-viewer-subtitle">${escapePublicHtml(input.item.originalFilename)} · ${escapePublicHtml(formatFileSize(input.item.sizeBytes))}</p></div><a class="share-viewer-open" href="${escapeAttribute(input.rawUrl)}" target="_blank" rel="noreferrer">打开原文件</a></section>${viewer}<footer class="share-viewer-footer">由 PageVault 发布与分享</footer></main>`;

  return publicDocument({
    title,
    head: shareHead({
      item: input.item,
      publicUrl: input.publicUrl,
      rawUrl: input.rawUrl,
      label,
      imagePreview: isImage,
    }),
    body,
  });
}
