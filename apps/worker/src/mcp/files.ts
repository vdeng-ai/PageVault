import {
  AppError,
  FILE_CAPABILITIES,
  fileCapabilityForFilename,
  sha256Hex,
} from "@pagevault/core";
import type { AppBindings } from "../bindings.js";

export const TEXT_LIMIT_BYTES = 256 * 1024;
export const MCP_JSON_LIMIT_BYTES = 2 * 1024 * 1024;
// The exact Azure host was observed in a real ChatGPT attachment diagnostic.
// Do not trust other storage accounts, regions, or all of blob.core.windows.net.
const DEFAULT_FILE_HOSTS = [
  ".oaiusercontent.com",
  "oaisdmntprwestus3.blob.core.windows.net",
];

export interface OpenAIFile {
  download_url: string;
  file_id: string;
  mime_type?: string | undefined;
  file_name?: string | undefined;
}

type DownloadUrlReason =
  | "allowed"
  | "invalid_url"
  | "https_required"
  | "credentials_not_allowed"
  | "port_not_allowed"
  | "fragment_not_allowed"
  | "unsafe_hostname"
  | "host_not_allowlisted";

/** An explicit projection: never include a URL, path, query, file ID, or credentials. */
export interface DownloadUrlDiagnostic {
  stage: "initial" | "redirect";
  hop: number;
  protocol: string | null;
  hostname: string | null;
  sourceHostname: string | null;
  allowlistMatched: boolean;
  reason: DownloadUrlReason;
}

const rejectionMessages: Record<
  Exclude<DownloadUrlReason, "allowed">,
  string
> = {
  invalid_url:
    "A host-provided HTTPS download URL is required; local paths and file IDs are not URLs.",
  https_required:
    "A host-provided HTTPS download URL is required; sandbox/file/data/blob references cannot be fetched remotely. Check the connector's file parameter forwarding.",
  credentials_not_allowed:
    "File download URLs must not contain embedded credentials.",
  port_not_allowed: "File download URLs must use the default HTTPS port.",
  fragment_not_allowed: "File download URLs must not contain a fragment.",
  unsafe_hostname: "Local or IP file download targets are not allowed.",
  host_not_allowlisted:
    "File download host is not allowlisted. Ask the administrator to verify diagnostic.hostname; do not retry with local paths or invented URLs.",
};

export class FileDownloadUrlError extends AppError {
  constructor(
    readonly diagnostic: DownloadUrlDiagnostic & {
      reason: Exclude<DownloadUrlReason, "allowed">;
    },
  ) {
    super(
      rejectionMessages[diagnostic.reason],
      400,
      diagnostic.reason === "host_not_allowlisted" ||
        diagnostic.reason === "unsafe_hostname"
        ? "file_host_not_allowed"
        : "invalid_file_url",
    );
  }
}

function diagnosticHostname(url: URL | undefined): string | null {
  // Non-HTTP URLs can have opaque authorities. Do not echo those user-supplied strings.
  return url &&
    ["https:", "http:"].includes(url.protocol) &&
    /^[a-z0-9.:[\]-]{1,253}$/i.test(url.hostname)
    ? url.hostname.toLowerCase()
    : null;
}

export function allowedFileHosts(env: AppBindings): string[] {
  return env.MCP_FILE_ALLOWED_HOSTS
    ? env.MCP_FILE_ALLOWED_HOSTS.split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    : DEFAULT_FILE_HOSTS;
}

export function validateDownloadUrl(
  value: string,
  hosts: string[],
  context: {
    base?: URL;
    hop?: number;
    report?: (diagnostic: DownloadUrlDiagnostic) => void;
  } = {},
): URL {
  const diagnostic: DownloadUrlDiagnostic = {
    stage: context.base ? "redirect" : "initial",
    hop: context.hop ?? 0,
    protocol: null,
    hostname: null,
    sourceHostname: diagnosticHostname(context.base),
    allowlistMatched: false,
    reason: "invalid_url",
  };
  function reject(reason: Exclude<DownloadUrlReason, "allowed">): never {
    diagnostic.reason = reason;
    context.report?.(diagnostic);
    throw new FileDownloadUrlError({ ...diagnostic, reason });
  }
  let url: URL;
  try {
    url = new URL(value, context.base);
  } catch {
    return reject("invalid_url");
  }
  const host = url.hostname.toLowerCase();
  diagnostic.protocol = [
    "https:",
    "http:",
    "sandbox:",
    "file:",
    "data:",
    "blob:",
  ].includes(url.protocol)
    ? url.protocol
    : "other";
  diagnostic.hostname = diagnosticHostname(url);
  diagnostic.allowlistMatched = hosts.some((entry) =>
    entry.startsWith(".")
      ? host.endsWith(entry) && host.length > entry.length
      : host === entry,
  );
  if (url.protocol !== "https:") return reject("https_required");
  if (url.username || url.password) return reject("credentials_not_allowed");
  if (url.port) return reject("port_not_allowed");
  if (url.hash) return reject("fragment_not_allowed");
  if (
    /^[\d.]+$/.test(host) ||
    host.includes(":") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return reject("unsafe_hostname");
  }
  if (!diagnostic.allowlistMatched) return reject("host_not_allowlisted");
  diagnostic.reason = "allowed";
  context.report?.(diagnostic);
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
  requestId?: string,
): Promise<ArrayBuffer> {
  const hosts = allowedFileHosts(env);
  const report = (diagnostic: DownloadUrlDiagnostic) => {
    if (env.MCP_FILE_DIAGNOSTICS === "true") {
      console.info(
        JSON.stringify({
          event: "mcp_file_url_check",
          ...(requestId ? { requestId } : {}),
          ...diagnostic,
        }),
      );
    }
  };
  let url = validateDownloadUrl(file.download_url, hosts, { report });
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
        url = validateDownloadUrl(location, hosts, {
          base: url,
          hop: redirects + 1,
          report,
        });
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
