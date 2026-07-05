import { MAX_SLUG_BASE_LENGTH } from "./constants.js";

export function slugifyFilename(filename: string): string {
  const leaf = filename.split(/[\\/]/).pop() ?? filename;
  const withoutExtension = leaf.replace(/\.(html|htm)$/i, "");
  const normalized = withoutExtension
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  const slug = normalized
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, MAX_SLUG_BASE_LENGTH)
    .replace(/-$/g, "");

  return slug.length > 0 ? slug : "html";
}

export function buildPublicSlug(filename: string, shortId: string): string {
  return `${slugifyFilename(filename)}-${shortId.toLowerCase()}`;
}

export function normalizePublicSlug(value: string): string {
  return decodeURIComponent(value).replace(/\.html$/i, "").replace(/\/+$/g, "");
}
