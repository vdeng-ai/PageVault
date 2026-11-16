import {
  AppError,
  FILE_CAPABILITIES,
  fileCapabilityForFilename,
  sha256Hex,
} from "@pagevault/core";
import type { AppBindings } from "../bindings.js";

export const TEXT_LIMIT_BYTES = 256 * 1024;
export const MCP_JSON_LIMIT_BYTES = 2 * 1024 * 1024;
const DEFAULT_FILE_HOSTS = [".oaiusercontent.com"];

export interface OpenAIFile {
  download_url: string;
  file_id: string;
  mime_type?: string | undefined;
  file_name?: string | undefined;
}

export function allowedFileHosts(env: AppBindings): string[] {
  return env.MCP_FILE_ALLOWED_HOSTS
    ? env.MCP_FILE_ALLOWED_HOSTS.split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    : DEFAULT_FILE_HOSTS;
}

export function validateDownloadUrl(value: string, hosts: string[]): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(
      "A host-provided HTTPS file URL is required",
      400,
      "invalid_file_url",
    );
  }
  const host = url.hostname.toLowerCase();
  const allowed = hosts.some((entry) =>
    entry.startsWith(".")
      ? host.endsWith(entry) && host.length > entry.length
      : host === entry,
  );
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    /^[\d.]+$/.test(host) ||
    host.includes(":") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    !allowed
  ) {
    throw new AppError(
      "File download host is not allowed; use a ChatGPT file reference",
      400,
      "file_host_not_allowed",
    );
  }
  return url;
}

/** Limits decoded bytes as well as Content-Length; never buffers an unbounded body. */
export async function readBoundedBytes(
  response: Response | Request,
  limit: number,
): Promise<ArrayBuffer> {
  const declared = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel();
    throw new AppError(
      "File or request is too large",
      413,
      "payload_too_large",
    );
  }
  const reader = response.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AppError(
          "File or request is too large",
          413,
          "payload_too_large",
        );
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

export async function resolveFilename(
  file: OpenAIFile,
  override?: string,
): Promise<string> {
  let name = override ?? file.file_name;
  if (!name) {
    const mime = file.mime_type?.split(";")[0]?.trim().toLowerCase();
    const capability = FILE_CAPABILITIES.find(
      (type) => type.contentType.split(";")[0] === mime,
    );
    if (!capability)
      throw new AppError(
        "Supply a filename with a supported extension",
        400,
        "filename_required",
      );
    name = `asset-${(await sha256Hex(file.file_id)).slice(0, 12)}${capability.storageExtension}`;
  }
  assertFilename(name);
  return name;
}

export function assertFilename(name: string): void {
  if (
    !name.trim() ||
    name.length > 240 ||
    /[\\/]/.test(name) ||
    Array.from(name).some(
      (character) =>
        (character.codePointAt(0) ?? 0) < 32 || character === "\x7f",
    )
  ) {
    throw new AppError(
      "Supply a filename, not a local path",
      400,
      "invalid_filename",
    );
  }
  if (!fileCapabilityForFilename(name)) {
    throw new AppError("Unsupported file extension", 400, "invalid_file_type");
  }
}

export async function downloadFile(
  file: OpenAIFile,
  env: AppBindings,
  maxBytes: number,
  fetchFile: typeof fetch = fetch,
): Promise<ArrayBuffer> {
  const hosts = allowedFileHosts(env);
  let url = validateDownloadUrl(file.download_url, hosts);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      // No PageVault bearer token, browser cookie, or user-provided headers are forwarded.
      const response = await fetchFile(url, {
        redirect: "manual",
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("Location");
        if (!location || redirects === 3) break;
        url = validateDownloadUrl(new URL(location, url).href, hosts);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new AppError(
          "File URL is unavailable or expired; attach the file again",
          400,
          "file_download_failed",
        );
      }
      return await readBoundedBytes(response, maxBytes);
    }
    throw new AppError(
      "Too many file download redirects",
      400,
      "file_download_failed",
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Fetch exceptions may contain signed URLs. Never return/log the original message.
    throw new AppError(
      "File download failed or timed out; attach the file again",
      400,
      "file_download_failed",
    );
  } finally {
    clearTimeout(timer);
  }
}
