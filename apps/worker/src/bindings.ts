import type { AdminSession, PageVaultService } from "@pagevault/core";

export interface AppBindings {
  ASSETS?: Fetcher;
  DB?: D1Database;
  HTML_BUCKET?: R2Bucket;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD_HASH: string;
  SESSION_SECRET: string;
  APP_ENV?: string;
  PUBLIC_BASE_URL: string;
  ADMIN_BASE_URL: string;
  DEFAULT_URL_EXPIRE_DAYS?: string;
  DEFAULT_FILE_EXPIRE_DAYS?: string;
  MAX_UPLOAD_SIZE_MB?: string;
  PUBLIC_HTML_CACHE_SECONDS?: string;
  ACCESS_COUNT_FLUSH_SECONDS?: string;
  ACCESS_COUNT_MODE?: string;
}

export interface AppVariables {
  session: AdminSession;
}

export type HonoRuntime = {
  Bindings: AppBindings;
  Variables: AppVariables;
};

export type ServiceFactory = (env: AppBindings) => PageVaultService;
export type AssetFetcher = (request: Request, env: AppBindings) => Promise<Response>;
export interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
}
