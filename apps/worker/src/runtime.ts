import { createPageVaultConfig, PageVaultService } from "@pagevault/core";
import { CloudflareD1Repository } from "./adapters/cloudflare-db.js";
import { CloudflareR2Storage } from "./adapters/cloudflare-storage.js";
import type { AppBindings } from "./bindings.js";

function numberEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function serviceFromCloudflareEnv(env: AppBindings): PageVaultService {
  if (!env.DB || !env.HTML_BUCKET) {
    throw new Error("Cloudflare DB and R2 bindings are required");
  }
  return new PageVaultService(
    new CloudflareD1Repository(env.DB),
    new CloudflareR2Storage(env.HTML_BUCKET),
    createPageVaultConfig({
      publicBaseUrl: env.PUBLIC_BASE_URL,
      defaultUrlExpireDays: numberEnv(env.DEFAULT_URL_EXPIRE_DAYS, 7),
      defaultFileExpireDays: numberEnv(env.DEFAULT_FILE_EXPIRE_DAYS, 180),
      maxUploadSizeMb: numberEnv(env.MAX_UPLOAD_SIZE_MB, 10)
    })
  );
}

export function hostnameFromBaseUrl(value: string): string {
  return new URL(value).hostname;
}

export function isLocalDevHost(hostname: string, env: AppBindings): boolean {
  return env.APP_ENV !== "production" && (hostname === "localhost" || hostname === "127.0.0.1");
}
