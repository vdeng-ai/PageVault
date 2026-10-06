import type { FileCapability, FileKind } from "./file-types.js";

export interface FileValidationResult {
  valid: boolean;
  reason?: string;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50] as const;

function hasBytes(
  bytes: Uint8Array,
  expected: readonly number[],
  offset = 0,
): boolean {
  if (bytes.byteLength < offset + expected.length) {
    return false;
  }
  return expected.every((value, index) => bytes[offset + index] === value);
}

function validateMagicBytes(
  kind: FileKind,
  bytes: Uint8Array,
): FileValidationResult {
  switch (kind) {
    case "jpeg":
      return hasBytes(bytes, JPEG_SIGNATURE)
        ? { valid: true }
        : { valid: false, reason: "missing JPEG signature" };
    case "pdf":
      return hasBytes(bytes, PDF_SIGNATURE)
        ? { valid: true }
        : { valid: false, reason: "missing PDF signature" };
    case "png":
      return hasBytes(bytes, PNG_SIGNATURE)
        ? { valid: true }
        : { valid: false, reason: "missing PNG signature" };
    case "webp":
      return hasBytes(bytes, RIFF_SIGNATURE) &&
        hasBytes(bytes, WEBP_SIGNATURE, 8)
        ? { valid: true }
        : { valid: false, reason: "missing WebP RIFF signature" };
    default:
      return { valid: false, reason: "unsupported binary signature" };
  }
}

function decodeUtf8Text(body: ArrayBuffer): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    for (const character of text) {
      const code = character.codePointAt(0) ?? 0;
      if (
        code === 0 ||
        (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d)
      ) {
        return null;
      }
    }
    return text;
  } catch {
    return null;
  }
}

function stripSvgPreamble(source: string): string {
  let rest = source.replace(/^\uFEFF/, "").trimStart();
  let previous = "";
  while (rest !== previous) {
    previous = rest;
    rest = rest
      .replace(/^<\?xml\b[\s\S]*?\?>\s*/i, "")
      .replace(/^<!--[\s\S]*?-->\s*/, "")
      .replace(/^<!DOCTYPE\s+svg\b(?:[^>"']|"[^"]*"|'[^']*')*>\s*/i, "")
      .trimStart();
  }
  return rest;
}

function validateText(body: ArrayBuffer): FileValidationResult {
  return decodeUtf8Text(body) !== null
    ? { valid: true }
    : { valid: false, reason: "content is not valid UTF-8 text" };
}

function validateSvg(body: ArrayBuffer): FileValidationResult {
  const text = decodeUtf8Text(body);
  if (text === null) {
    return { valid: false, reason: "SVG is not valid UTF-8 text" };
  }
  return /^<svg(?:\s|>)/i.test(stripSvgPreamble(text))
    ? { valid: true }
    : { valid: false, reason: "missing SVG root element" };
}

export function validateFileContent(
  capability: FileCapability,
  body: ArrayBuffer,
): FileValidationResult {
  switch (capability.validation) {
    case "text":
      return validateText(body);
    case "svg":
      return validateSvg(body);
    case "magic-bytes":
      return validateMagicBytes(capability.kind, new Uint8Array(body));
  }
}
