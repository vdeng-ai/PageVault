import type {
  AccessCountInput,
  ApiKey,
  AuditLogInput,
  ClaimApiUploadIdempotencyInput,
  ApiUploadIdempotencyClaim,
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
  claimApiUploadIdempotency(
    input: ClaimApiUploadIdempotencyInput,
  ): Promise<ApiUploadIdempotencyClaim>;
  completeApiUploadIdempotency(
    apiKeyId: string,
    idempotencyKey: string,
    owner: string,
    updatedAt: string,
    expiresAt: string,
  ): Promise<void>;
  abandonApiUploadIdempotency(
    apiKeyId: string,
    idempotencyKey: string,
    owner: string,
  ): Promise<void>;
  deleteExpiredApiUploadIdempotency(now: string, limit: number): Promise<number>;
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
