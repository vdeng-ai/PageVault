import {
  HTML_CONTENT_TYPE,
  JPEG_CONTENT_TYPE,
  MARKDOWN_CONTENT_TYPE,
  PDF_CONTENT_TYPE,
  PNG_CONTENT_TYPE,
  SVG_CONTENT_TYPE,
  WEBP_CONTENT_TYPE,
} from "./constants.js";

export type FileKind =
  | "html"
  | "markdown"
  | "jpeg"
  | "pdf"
  | "png"
  | "svg"
  | "webp";

export type FilePreviewMode =
  | "html-sandbox"
  | "markdown"
  | "image"
  | "pdf-native";

export type FileDeliveryMode = "document" | "inline";
export type FileSecurityProfile = "html" | "svg" | "binary";
export type FileValidationMode = "text" | "svg" | "magic-bytes";
export type FileSharePreviewMode = "html-meta" | "image" | "generic";

export interface FileCapability {
  kind: FileKind;
  label: "HTML" | "Markdown" | "PDF" | "Image";
  extensions: readonly string[];
  contentType: string;
  storageExtension: string;
  preview: FilePreviewMode;
  delivery: FileDeliveryMode;
  securityProfile: FileSecurityProfile;
  validation: FileValidationMode;
  sharePreview: FileSharePreviewMode;
}

export const FILE_CAPABILITIES: readonly FileCapability[] = [
  {
    kind: "html",
    label: "HTML",
    extensions: [".html", ".htm"],
    contentType: HTML_CONTENT_TYPE,
    storageExtension: ".html",
    preview: "html-sandbox",
    delivery: "document",
    securityProfile: "html",
    validation: "text",
    sharePreview: "html-meta",
  },
  {
    kind: "markdown",
    label: "Markdown",
    extensions: [".md", ".markdown"],
    contentType: MARKDOWN_CONTENT_TYPE,
    storageExtension: ".md",
    preview: "markdown",
    delivery: "document",
    securityProfile: "html",
    validation: "text",
    sharePreview: "html-meta",
  },
  {
    kind: "jpeg",
    label: "Image",
    extensions: [".jpg", ".jpeg"],
    contentType: JPEG_CONTENT_TYPE,
    storageExtension: ".jpg",
    preview: "image",
    delivery: "inline",
    securityProfile: "binary",
    validation: "magic-bytes",
    sharePreview: "image",
  },
  {
    kind: "pdf",
    label: "PDF",
    extensions: [".pdf"],
    contentType: PDF_CONTENT_TYPE,
    storageExtension: ".pdf",
    preview: "pdf-native",
    delivery: "inline",
    securityProfile: "binary",
    validation: "magic-bytes",
    sharePreview: "generic",
  },
  {
    kind: "png",
    label: "Image",
    extensions: [".png"],
    contentType: PNG_CONTENT_TYPE,
    storageExtension: ".png",
    preview: "image",
    delivery: "inline",
    securityProfile: "binary",
    validation: "magic-bytes",
    sharePreview: "image",
  },
  {
    kind: "svg",
    label: "Image",
    extensions: [".svg"],
    contentType: SVG_CONTENT_TYPE,
    storageExtension: ".svg",
    preview: "image",
    delivery: "inline",
    securityProfile: "svg",
    validation: "svg",
    sharePreview: "image",
  },
  {
    kind: "webp",
    label: "Image",
    extensions: [".webp"],
    contentType: WEBP_CONTENT_TYPE,
    storageExtension: ".webp",
    preview: "image",
    delivery: "inline",
    securityProfile: "binary",
    validation: "magic-bytes",
    sharePreview: "image",
  },
] as const;

export const SUPPORTED_UPLOAD_FILE_TYPES = FILE_CAPABILITIES;
export type SupportedFileKind = FileKind;
export type SupportedUploadFileType = FileCapability;

export const SUPPORTED_UPLOAD_EXTENSIONS = FILE_CAPABILITIES.flatMap(
  (capability) => capability.extensions,
);

export const SUPPORTED_UPLOAD_ACCEPT = FILE_CAPABILITIES.flatMap(
  (capability) => [
    ...capability.extensions,
    capability.contentType.split(";")[0]?.trim() ?? capability.contentType,
  ],
)
  .filter((value, index, values) => values.indexOf(value) === index)
  .join(",");

export function leafFilename(filename: string): string {
  return filename.split(/[\\/]/).pop() ?? filename;
}

export function fileCapabilityForFilename(
  filename: string,
): FileCapability | null {
  const lower = leafFilename(filename).toLowerCase();
  return (
    FILE_CAPABILITIES.find((capability) =>
      capability.extensions.some((extension) => lower.endsWith(extension)),
    ) ?? null
  );
}

export function fileCapabilityForContentType(
  contentType: string,
): FileCapability | null {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return (
    FILE_CAPABILITIES.find(
      (capability) =>
        (capability.contentType.split(";")[0]?.trim().toLowerCase() ?? "") ===
        normalized,
    ) ?? null
  );
}

export function uploadFileTypeForFilename(
  filename: string,
): SupportedUploadFileType | null {
  return fileCapabilityForFilename(filename);
}

export function stripSupportedFileExtension(filename: string): string {
  const leaf = leafFilename(filename);
  const lower = leaf.toLowerCase();
  const extension = SUPPORTED_UPLOAD_EXTENSIONS.find((nextExtension) =>
    lower.endsWith(nextExtension),
  );
  return extension ? leaf.slice(0, -extension.length) : leaf;
}
