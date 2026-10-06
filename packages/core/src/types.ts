import type { StoredObject } from "./storage.js";

export type Visibility = "public" | "private";
export type ItemStatus = "active" | "disabled" | "deleted";
export type DerivedStatus =
  | "active"
  | "private"
  | "disabled"
  | "deleted"
  | "url_expired"
  | "file_expired";

export interface VaultItem {
  id: string;
  title: string;
  originalFilename: string;
  slug: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  visibility: Visibility;
  status: ItemStatus;
  urlExpiresAt: string;
  fileExpiresAt: string;
  accessCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** @deprecated Use VaultItem. */
export type HtmlItem = VaultItem;

export interface CreateItemInput {
  item: VaultItem;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreateApiKeyInput {
  apiKey: ApiKey;
  tokenHash: string;
}

export interface CreatedApiKey {
  apiKey: ApiKey;
  token: string;
}

export interface ApiUploadLease {
  owner: string;
  expiresAt: string;
}

export interface UpdateItemInput {
  title?: string;
  visibility?: Visibility;
  status?: ItemStatus;
  urlExpiresAt?: string;
  fileExpiresAt?: string;
  updatedAt?: string;
}

export interface ListItemsInput {
  page: number;
  pageSize: number;
  q?: string;
  status?: ItemStatus | DerivedStatus | "";
  visibility?: Visibility | "";
  includeDeleted?: boolean;
  includeTotal?: boolean;
}

export interface ListItemsResult {
  items: VaultItem[];
  page: number;
  pageSize: number;
  total: number | null;
  hasNextPage: boolean;
}

export interface AuditLogInput {
  id: string;
  itemId?: string | null;
  action: string;
  detail?: string | null;
  createdAt: string;
}

export interface AccessCountInput {
  id: string;
  count: number;
  accessedAt: string;
}

export interface UploadFileInput {
  filename: string;
  body: ArrayBuffer;
  urlExpireDays?: number;
  fileExpireDays?: number;
  visibility?: Visibility;
  now?: Date;
}

/** @deprecated Use UploadFileInput. */
export type UploadHtmlInput = UploadFileInput;

export interface UploadResult {
  item: VaultItem;
  publicUrl: string;
}

export type PublicContentResult =
  | { kind: "ok"; item: VaultItem; object: StoredObject }
  | { kind: "not_found" }
  | { kind: "disabled" }
  | { kind: "gone" };

/** @deprecated Use PublicContentResult. */
export type PublicHtmlResult = PublicContentResult;

export type PublicItemResult =
  | { kind: "ok"; item: VaultItem }
  | { kind: "not_found" }
  | { kind: "disabled" }
  | { kind: "gone" };

export type BatchAction =
  | "extend_url"
  | "extend_file"
  | "set_url_expires_at"
  | "set_file_expires_at"
  | "set_public"
  | "set_private"
  | "disable"
  | "restore"
  | "delete";

export interface BatchInput {
  ids: string[];
  action: BatchAction;
  days?: number;
  urlExpiresAt?: string;
  fileExpiresAt?: string;
  now?: Date;
}

export interface BatchResult {
  ok: number;
  failed: Array<{ id: string; error: string }>;
}

export interface GcResult {
  scanned: number;
  deleted: number;
  deletedSlugs: string[];
  failed: Array<{ id: string; error: string }>;
}

export interface DashboardStats {
  total: number;
  totalSizeBytes: number;
  publicCount: number;
  urlExpired: number;
  fileDeletingSoon: number;
  deleted: number;
}

export interface PageVaultConfig {
  publicBaseUrl: string;
  defaultUrlExpireDays: number;
  defaultFileExpireDays: number;
  maxUploadSizeMb: number;
}

export interface AdminSession {
  email: string;
  csrfToken: string;
  expiresAt: string;
}
