import { MAX_SLUG_BASE_LENGTH } from "./constants.js";
import { leafFilename, stripSupportedFileExtension } from "./file-types.js";

export function slugifyFilename(filename: string): string {
  const withoutExtension = stripSupportedFileExtension(leafFilename(filename));
  const normalized = withoutExtension
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  const normalizedSlug = normalized
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const slug = Array.from(normalizedSlug)
    .slice(0, MAX_SLUG_BASE_LENGTH)
    .join("")
    .replace(/-$/g, "");

  return slug.length > 0 ? slug : "html";
}

export function buildPublicSlug(filename: string, shortId: string): string {
  return `${slugifyFilename(filename)}-${shortId.toLowerCase()}`;
}

export function normalizePublicSlug(value: string): string | null {
  try {
    return decodeURIComponent(value)
      .replace(/\.html$/i, "")
      .replace(/\/+$/g, "");
  } catch {
    return null;
  }
}
