import type {
  AuditLogInput,
  CreateItemInput,
  HtmlItem,
  ListItemsInput,
  ListItemsResult,
  UpdateItemInput
} from "./types.js";

export interface MetadataRepository {
  createItem(input: CreateItemInput): Promise<HtmlItem>;
  getItemById(id: string): Promise<HtmlItem | null>;
  getItemBySlug(slug: string): Promise<HtmlItem | null>;
  listItems(input: ListItemsInput): Promise<ListItemsResult>;
  updateItem(id: string, patch: UpdateItemInput): Promise<HtmlItem>;
  markDeleted(id: string, deletedAt: string): Promise<void>;
  incrementAccess(id: string, accessedAt: string): Promise<void>;
  findExpiredFiles(now: string, limit: number): Promise<HtmlItem[]>;
  writeAuditLog(input: AuditLogInput): Promise<void>;
}
