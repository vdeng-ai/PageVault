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
  fallbackImageUrl: string;
  label: string;
  rasterImagePreview: boolean;
}): string {
  const title = escapeAttribute(input.item.title || input.item.originalFilename);
  const description = escapeAttribute(
    shareDescription(input.item, input.label),
  );
  const publicUrl = escapeAttribute(input.publicUrl);
  const imageUrl = escapeAttribute(
    input.rasterImagePreview ? input.rawUrl : input.fallbackImageUrl,
  );
  const imageAlt = escapeAttribute(
    input.rasterImagePreview
      ? input.item.title || input.item.originalFilename
      : "PageVault 分享预览",
  );

  return [
    `<meta name="description" content="${description}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${publicUrl}">`,
    '<meta property="og:site_name" content="PageVault">',
    `<meta property="og:image" content="${imageUrl}">`,
    `<meta property="og:image:alt" content="${imageAlt}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<link rel="canonical" href="${publicUrl}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${imageUrl}">`,
    `<meta name="twitter:image:alt" content="${imageAlt}">`,
  ].join("");
}

function iframeViewer(
  rawUrl: string,
  title: string,
  sandbox: boolean,
  kind: "html" | "pdf",
): string {
  return `<section class="share-viewer-stage share-viewer-stage-frame" data-fullscreen-target><iframe class="share-viewer-frame" src="${escapeAttribute(rawUrl)}" title="${escapeAttribute(title)}" referrerpolicy="no-referrer" allowfullscreen data-viewer-kind="${kind}"${sandbox ? ' sandbox="allow-scripts"' : ""}></iframe></section>`;
}

function imageViewer(rawUrl: string, title: string): string {
  return `<section class="share-viewer-stage share-viewer-image-wrap" data-image-stage data-image-background="dark"><img class="share-viewer-image" data-image-view src="${escapeAttribute(rawUrl)}" alt="${escapeAttribute(title)}"></section>`;
}

function viewerActions(input: {
  publicUrl: string;
  rawUrl: string;
  supportsFullscreen: boolean;
  imageControls: boolean;
}): string {
  return `<div class="share-viewer-actions">
    <button class="share-viewer-action" type="button" data-copy-share data-copy-value="${escapeAttribute(input.publicUrl)}">复制链接</button>
    ${input.imageControls ? '<button class="share-viewer-action" type="button" data-image-fit>查看原尺寸</button><button class="share-viewer-action" type="button" data-image-background-toggle>切换背景</button>' : ""}
    ${input.supportsFullscreen ? '<button class="share-viewer-action" type="button" data-fullscreen-toggle>全屏查看</button>' : ""}
    <a class="share-viewer-action share-viewer-action-primary" href="${escapeAttribute(input.rawUrl)}" target="_blank" rel="noreferrer">打开原文件</a>
  </div>`;
}

export async function renderPublicShareViewer(input: {
  item: VaultItem;
  publicUrl: string;
  rawUrl: string;
  fallbackImageUrl: string;
  markdownObject?: StoredObject | null;
}): Promise<string> {
  const capability = fileCapabilityForContentType(input.item.contentType);
  const label = capability?.label ?? "File";
  const title = input.item.title || input.item.originalFilename;
  const isMarkdown = isMarkdownContentType(input.item.contentType);
  const isRasterImage =
    capability?.kind === "jpeg" ||
    capability?.kind === "png" ||
    capability?.kind === "webp";
  const isImage = isRasterImage || capability?.kind === "svg";
  const supportsFullscreen =
    capability?.kind === "html" || capability?.kind === "pdf";

  let viewer: string;
  if (isMarkdown && input.markdownObject) {
    viewer = `<section class="share-viewer-markdown">${await renderPublicMarkdownBody({
      item: input.item,
      object: input.markdownObject,
    })}</section>`;
  } else if (capability?.kind === "html") {
    viewer = iframeViewer(input.rawUrl, title, true, "html");
  } else if (capability?.kind === "pdf") {
    viewer = iframeViewer(input.rawUrl, title, false, "pdf");
  } else if (isImage) {
    viewer = imageViewer(input.rawUrl, title);
  } else {
    viewer = `<section class="share-viewer-stage share-viewer-fallback"><div><p>当前文件可直接打开原文件查看。</p><a class="share-viewer-action share-viewer-action-primary" href="${escapeAttribute(input.rawUrl)}" target="_blank" rel="noreferrer">打开原文件</a></div></section>`;
  }

  const body = `${publicHeader(true)}<main class="share-viewer-shell"><section class="share-viewer-meta"><div class="share-viewer-copy"><p class="share-viewer-eyebrow">${escapePublicHtml(label)}</p><h1 class="share-viewer-title">${escapePublicHtml(title)}</h1><p class="share-viewer-subtitle">${escapePublicHtml(input.item.originalFilename)} · ${escapePublicHtml(formatFileSize(input.item.sizeBytes))}</p></div>${viewerActions({
    publicUrl: input.publicUrl,
    rawUrl: input.rawUrl,
    supportsFullscreen,
    imageControls: isImage,
  })}</section><p class="share-viewer-feedback" data-share-feedback aria-live="polite"></p>${viewer}<footer class="share-viewer-footer">由 PageVault 发布与分享</footer></main>`;

  return publicDocument({
    title,
    head: shareHead({
      item: input.item,
      publicUrl: input.publicUrl,
      rawUrl: input.rawUrl,
      fallbackImageUrl: input.fallbackImageUrl,
      label,
      rasterImagePreview: isRasterImage,
    }),
    body,
  });
}
