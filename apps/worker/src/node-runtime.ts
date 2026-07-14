import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { createPageVaultConfig, PageVaultService } from "@pagevault/core";
import { NodeSqliteRepository } from "./adapters/node-db.js";
import { LocalFileStorage } from "./adapters/node-storage.js";
import type { AppBindings } from "./bindings.js";

export interface NodeRuntime {
  env: AppBindings;
  service: PageVaultService;
  migrate(): Promise<void>;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function numberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createNodeRuntime(): NodeRuntime {
  const sqlitePath = process.env.SQLITE_PATH ?? "/data/pagevault/pagevault.sqlite";
  const localStorageDir = process.env.LOCAL_STORAGE_DIR ?? "/data/pagevault/objects";
  const repository = NodeSqliteRepository.open(sqlitePath);
  const storage = new LocalFileStorage(localStorageDir);
  const env: AppBindings = {
    ADMIN_EMAIL: requiredEnv("ADMIN_EMAIL"),
    ADMIN_PASSWORD_HASH: requiredEnv("ADMIN_PASSWORD_HASH"),
    SESSION_SECRET: requiredEnv("SESSION_SECRET"),
    APP_ENV: process.env.APP_ENV ?? "production",
    ADMIN_BASE_URL: process.env.ADMIN_BASE_URL ?? "https://admin-html.example.com",
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? "https://h.example.com",
    DEFAULT_URL_EXPIRE_DAYS: String(numberEnv("DEFAULT_URL_EXPIRE_DAYS", 7)),
    DEFAULT_FILE_EXPIRE_DAYS: String(numberEnv("DEFAULT_FILE_EXPIRE_DAYS", 180)),
    MAX_UPLOAD_SIZE_MB: String(numberEnv("MAX_UPLOAD_SIZE_MB", 10))
  };
  const service = new PageVaultService(
    repository,
    storage,
    createPageVaultConfig({
      publicBaseUrl: env.PUBLIC_BASE_URL,
      defaultUrlExpireDays: numberEnv("DEFAULT_URL_EXPIRE_DAYS", 7),
      defaultFileExpireDays: numberEnv("DEFAULT_FILE_EXPIRE_DAYS", 180),
      maxUploadSizeMb: numberEnv("MAX_UPLOAD_SIZE_MB", 10)
    })
  );

  return {
    env,
    service,
    migrate: () => repository.migrate(resolve(process.cwd(), "migrations/0001_initial.sql"))
  };
}

function contentType(pathname: string): string {
  switch (extname(pathname)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".json":
      return "application/json; charset=utf-8";
    case ".ico":
      return "image/x-icon";
    case ".html":
    default:
      return "text/html; charset=utf-8";
  }
}

export function createStaticAssetFetcher(root = resolve(process.cwd(), "apps/admin/dist")) {
  return async function fetchAsset(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const safePath = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
    const candidate = resolve(join(root, safePath));
    const target = candidate.startsWith(root) ? candidate : join(root, "index.html");

    try {
      const info = await stat(target);
      if (info.isFile()) {
        return new Response(await readFile(target), {
          headers: {
            "Content-Type": contentType(target),
            "Cache-Control": target.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable"
          }
        });
      }
    } catch {
      // Fall through to SPA fallback.
    }

    return new Response(await readFile(join(root, "index.html")), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  };
}
