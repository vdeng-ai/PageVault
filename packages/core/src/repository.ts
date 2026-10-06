import type {
  AccessCountInput,
  ApiKey,
  AuditLogInput,
  CreateApiKeyInput,
  CreateItemInput,
  DashboardStats,
  VaultItem,
  ListItemsInput,
  ListItemsResult,
  UpdateItemInput,
} from "./types.js";

export interface MetadataRepository {
  createApiKey(input: CreateApiKeyInput): Promise<ApiKey>;
  listApiKeys(): Promise<ApiKey[]>;
  getActiveApiKeyByHash(tokenHash: string): Promise<ApiKey | null>;
  updateApiKeyLastUsedAt(id: string, lastUsedAt: string): Promise<void>;
  revokeApiKey(id: string, revokedAt: string): Promise<boolean>;
  tryAcquireApiUploadLease(
    owner: string,
    expiresAt: string,
    now: string,
  ): Promise<boolean>;
  releaseApiUploadLease(owner: string): Promise<void>;
  createItem(input: CreateItemInput): Promise<VaultItem>;
  getItemById(id: string): Promise<VaultItem | null>;
  getItemsByIds(ids: string[]): Promise<VaultItem[]>;
  getItemBySlug(slug: string): Promise<VaultItem | null>;
  listItems(input: ListItemsInput): Promise<ListItemsResult>;
  getDashboardStats(now: string, soon: string): Promise<DashboardStats>;
  updateItem(id: string, patch: UpdateItemInput): Promise<VaultItem>;
  markDeleted(id: string, deletedAt: string): Promise<void>;
  incrementAccess(id: string, accessedAt: string): Promise<void>;
  incrementAccessBatch(input: AccessCountInput[]): Promise<void>;
  findExpiredFiles(now: string, limit: number): Promise<VaultItem[]>;
  writeAuditLog(input: AuditLogInput): Promise<void>;
}
