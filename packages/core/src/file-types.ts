import {
  HTML_CONTENT_TYPE,
  JPEG_CONTENT_TYPE,
  MARKDOWN_CONTENT_TYPE,
  PNG_CONTENT_TYPE,
  WEBP_CONTENT_TYPE,
} from "./constants.js";

export type SupportedFileKind = "html" | "markdown" | "jpeg" | "png" | "webp";

export interface SupportedUploadFileType {
  kind: SupportedFileKind;
  extensions: readonly string[];
  contentType: string;
  storageExtension: string;
}

export const SUPPORTED_UPLOAD_FILE_TYPES: readonly SupportedUploadFileType[] = [
  {
    kind: "html",
    extensions: [".html", ".htm"],
    contentType: HTML_CONTENT_TYPE,
    storageExtension: ".html",
  },
  {
    kind: "markdown",
    extensions: [".md", ".markdown"],
    contentType: MARKDOWN_CONTENT_TYPE,
    storageExtension: ".md",
  },
  {
    kind: "jpeg",
    extensions: [".jpg", ".jpeg"],
    contentType: JPEG_CONTENT_TYPE,
    storageExtension: ".jpg",
  },
  {
    kind: "png",
    extensions: [".png"],
    contentType: PNG_CONTENT_TYPE,
    storageExtension: ".png",
  },
  {
    kind: "webp",
    extensions: [".webp"],
    contentType: WEBP_CONTENT_TYPE,
    storageExtension: ".webp",
  },
] as const;

export const SUPPORTED_UPLOAD_EXTENSIONS = SUPPORTED_UPLOAD_FILE_TYPES.flatMap(
  (type) => type.extensions,
);

export function leafFilename(filename: string): string {
  return filename.split(/[\\/]/).pop() ?? filename;
}

export function uploadFileTypeForFilename(
  filename: string,
): SupportedUploadFileType | null {
  const lower = leafFilename(filename).toLowerCase();
  return (
    SUPPORTED_UPLOAD_FILE_TYPES.find((type) =>
      type.extensions.some((extension) => lower.endsWith(extension)),
    ) ?? null
  );
}

export function stripSupportedFileExtension(filename: string): string {
  const leaf = leafFilename(filename);
  const lower = leaf.toLowerCase();
  const extension = SUPPORTED_UPLOAD_EXTENSIONS.find((nextExtension) =>
    lower.endsWith(nextExtension),
  );
  return extension ? leaf.slice(0, -extension.length) : leaf;
}
