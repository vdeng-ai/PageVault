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
  OperationsSummary,
  ReconciliationItemPage,
  UpdateItemInput,
} from "./types.js";

export interface MetadataRepository {
  healthCheck(): Promise<void>;
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
  getItemsByObjectKeys(objectKeys: string[]): Promise<VaultItem[]>;
  getItemBySlug(slug: string): Promise<VaultItem | null>;
  listItems(input: ListItemsInput): Promise<ListItemsResult>;
  getDashboardStats(now: string, soon: string): Promise<DashboardStats>;
  getOperationsSummary(): Promise<OperationsSummary>;
  updateItem(id: string, patch: UpdateItemInput): Promise<VaultItem>;
  markDeleted(id: string, deletedAt: string): Promise<void>;
  incrementAccess(id: string, accessedAt: string): Promise<void>;
  incrementAccessBatch(input: AccessCountInput[]): Promise<void>;
  findExpiredFiles(now: string, limit: number): Promise<VaultItem[]>;
  listItemsForReconciliation(
    cursor: string | null,
    limit: number,
  ): Promise<ReconciliationItemPage>;
  getMaintenanceState(key: string): Promise<string | null>;
  setMaintenanceState(
    key: string,
    value: string | null,
    updatedAt: string,
  ): Promise<void>;
  writeAuditLog(input: AuditLogInput): Promise<void>;
}
