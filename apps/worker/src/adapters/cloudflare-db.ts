import { AppError, type MetadataRepository } from "@pagevault/core";
import type {
  AccessCountInput,
  ApiKey,
  AuditLogInput,
  CreateApiKeyInput,
  CreateItemInput,
  DashboardStats,
  HtmlItem,
  ListItemsInput,
  ListItemsResult,
  UpdateItemInput,
} from "@pagevault/core";
import {
  buildListWhere,
  insertItemSql,
  itemToRowValues,
  mapItemRow,
  type HtmlItemRow,
} from "./item-row.js";

type BindValue = string | number | null;

interface DashboardStatsRow {
  total: number;
  public_count: number;
  url_expired: number;
  file_deleting_soon: number;
  deleted: number;
}

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

function mapApiKeyRow(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    name: row.name,
    prefix: row.key_prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export class CloudflareD1Repository implements MetadataRepository {
  constructor(private readonly db: D1Database) {}

  async createApiKey(input: CreateApiKeyInput): Promise<ApiKey> {
    const { apiKey } = input;
    await this.db
      .prepare(
        "INSERT INTO api_keys (id, name, key_prefix, token_hash, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        apiKey.id,
        apiKey.name,
        apiKey.prefix,
        input.tokenHash,
        apiKey.createdAt,
        apiKey.lastUsedAt,
        apiKey.revokedAt,
      )
      .run();
    return apiKey;
  }

  async listApiKeys(): Promise<ApiKey[]> {
    const rows = await this.db
      .prepare(
        "SELECT id, name, key_prefix, created_at, last_used_at, revoked_at FROM api_keys ORDER BY created_at DESC",
      )
      .all<ApiKeyRow>();
    return rows.results.map(mapApiKeyRow);
  }

  async getActiveApiKeyByHash(tokenHash: string): Promise<ApiKey | null> {
    const row = await this.db
      .prepare(
        "SELECT id, name, key_prefix, created_at, last_used_at, revoked_at FROM api_keys WHERE token_hash = ? AND revoked_at IS NULL LIMIT 1",
      )
      .bind(tokenHash)
      .first<ApiKeyRow>();
    return row ? mapApiKeyRow(row) : null;
  }

  async updateApiKeyLastUsedAt(id: string, lastUsedAt: string): Promise<void> {
    await this.db
      .prepare(
        "UPDATE api_keys SET last_used_at = ? WHERE id = ? AND revoked_at IS NULL",
      )
      .bind(lastUsedAt, id)
      .run();
  }

  async revokeApiKey(id: string, revokedAt: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
      )
      .bind(revokedAt, id)
      .run();
    return result.meta.changes > 0;
  }

  async tryAcquireApiUploadLease(
    owner: string,
    expiresAt: string,
    now: string,
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `
          INSERT INTO api_upload_lock (name, owner, expires_at)
          VALUES ('global', ?, ?)
          ON CONFLICT(name) DO UPDATE SET
            owner = excluded.owner,
            expires_at = excluded.expires_at
          WHERE api_upload_lock.expires_at <= ?
        `,
      )
      .bind(owner, expiresAt, now)
      .run();
    return result.meta.changes > 0;
  }

  async releaseApiUploadLease(owner: string): Promise<void> {
    await this.db
      .prepare(
        "DELETE FROM api_upload_lock WHERE name = 'global' AND owner = ?",
      )
      .bind(owner)
      .run();
  }

  async createItem(input: CreateItemInput): Promise<HtmlItem> {
    await this.db
      .prepare(insertItemSql)
      .bind(...itemToRowValues(input.item))
      .run();
    return input.item;
  }

  async getItemById(id: string): Promise<HtmlItem | null> {
    const row = await this.db
      .prepare("SELECT * FROM html_items WHERE id = ? LIMIT 1")
      .bind(id)
      .first<HtmlItemRow>();
    return row ? mapItemRow(row) : null;
  }

  async getItemsByIds(ids: string[]): Promise<HtmlItem[]> {
    const uniqueIds = Array.from(new Set(ids)).filter((id) => id.length > 0);
    if (uniqueIds.length === 0) {
      return [];
    }

    const items: HtmlItem[] = [];
    const chunkSize = 50;
    for (let offset = 0; offset < uniqueIds.length; offset += chunkSize) {
      const chunk = uniqueIds.slice(offset, offset + chunkSize);
      const placeholders = chunk.map(() => "?").join(", ");
      const rows = await this.db
        .prepare(`SELECT * FROM html_items WHERE id IN (${placeholders})`)
        .bind(...chunk)
        .all<HtmlItemRow>();
      items.push(...rows.results.map(mapItemRow));
    }
    return items;
  }

  async getItemBySlug(slug: string): Promise<HtmlItem | null> {
    const row = await this.db
      .prepare("SELECT * FROM html_items WHERE slug = ? LIMIT 1")
      .bind(slug)
      .first<HtmlItemRow>();
    return row ? mapItemRow(row) : null;
  }

  async listItems(input: ListItemsInput): Promise<ListItemsResult> {
    const page = Math.max(1, input.page);
    const pageSize = Math.min(Math.max(1, input.pageSize), 100);
    const offset = (page - 1) * pageSize;
    const { whereSql, values } = buildListWhere(input);
    const includeTotal = input.includeTotal === true;
    const countRow = includeTotal
      ? await this.db
          .prepare(`SELECT COUNT(*) AS total FROM html_items ${whereSql}`)
          .bind(...values)
          .first<{ total: number }>()
      : null;
    const rows = await this.db
      .prepare(
        `SELECT * FROM html_items ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...values, includeTotal ? pageSize : pageSize + 1, offset)
      .all<HtmlItemRow>();
    const hasNextPage = includeTotal
      ? page * pageSize < (countRow?.total ?? 0)
      : rows.results.length > pageSize;

    return {
      items: rows.results.slice(0, pageSize).map(mapItemRow),
      page,
      pageSize,
      total: includeTotal ? (countRow?.total ?? 0) : null,
      hasNextPage,
    };
  }

  async getDashboardStats(now: string, soon: string): Promise<DashboardStats> {
    const row = await this.db
      .prepare(
        `
          SELECT
            COALESCE(SUM(CASE WHEN status != 'deleted' THEN 1 ELSE 0 END), 0) AS total,
            COALESCE(SUM(CASE WHEN status = 'active' AND visibility = 'public' THEN 1 ELSE 0 END), 0) AS public_count,
            COALESCE(SUM(CASE WHEN status != 'deleted' AND url_expires_at <= ? THEN 1 ELSE 0 END), 0) AS url_expired,
            COALESCE(SUM(CASE WHEN status != 'deleted' AND file_expires_at > ? AND file_expires_at <= ? THEN 1 ELSE 0 END), 0) AS file_deleting_soon,
            COALESCE(SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END), 0) AS deleted
          FROM html_items
        `,
      )
      .bind(now, now, soon)
      .first<DashboardStatsRow>();

    return {
      total: row?.total ?? 0,
      publicCount: row?.public_count ?? 0,
      urlExpired: row?.url_expired ?? 0,
      fileDeletingSoon: row?.file_deleting_soon ?? 0,
      deleted: row?.deleted ?? 0,
    };
  }

  async updateItem(id: string, patch: UpdateItemInput): Promise<HtmlItem> {
    const assignments: string[] = [];
    const values: BindValue[] = [];
    const append = (column: string, value: BindValue): void => {
      assignments.push(`${column} = ?`);
      values.push(value);
    };

    if (patch.title !== undefined) append("title", patch.title);
    if (patch.visibility !== undefined) append("visibility", patch.visibility);
    if (patch.status !== undefined) append("status", patch.status);
    if (patch.urlExpiresAt !== undefined)
      append("url_expires_at", patch.urlExpiresAt);
    if (patch.fileExpiresAt !== undefined)
      append("file_expires_at", patch.fileExpiresAt);
    if (patch.updatedAt !== undefined) append("updated_at", patch.updatedAt);

    if (assignments.length === 0) {
      const existing = await this.getItemById(id);
      if (!existing) {
        throw new AppError("Item not found", 404, "item_not_found");
      }
      return existing;
    }

    await this.db
      .prepare(`UPDATE html_items SET ${assignments.join(", ")} WHERE id = ?`)
      .bind(...values, id)
      .run();

    const item = await this.getItemById(id);
    if (!item) {
      throw new AppError("Item not found", 404, "item_not_found");
    }
    return item;
  }

  async markDeleted(id: string, deletedAt: string): Promise<void> {
    await this.db
      .prepare(
        "UPDATE html_items SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?",
      )
      .bind(deletedAt, deletedAt, id)
      .run();
  }

  async incrementAccess(id: string, accessedAt: string): Promise<void> {
    await this.incrementAccessBatch([{ id, count: 1, accessedAt }]);
  }

  async incrementAccessBatch(input: AccessCountInput[]): Promise<void> {
    if (input.length === 0) {
      return;
    }
    await this.db.batch(
      input.map((entry) =>
        this.db
          .prepare(
            "UPDATE html_items SET access_count = access_count + ?, last_accessed_at = ? WHERE id = ?",
          )
          .bind(entry.count, entry.accessedAt, entry.id),
      ),
    );
  }

  async findExpiredFiles(now: string, limit: number): Promise<HtmlItem[]> {
    const rows = await this.db
      .prepare(
        "SELECT * FROM html_items WHERE file_expires_at <= ? AND status != 'deleted' ORDER BY file_expires_at ASC LIMIT ?",
      )
      .bind(now, limit)
      .all<HtmlItemRow>();
    return rows.results.map(mapItemRow);
  }

  async writeAuditLog(input: AuditLogInput): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO audit_logs (id, item_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(
        input.id,
        input.itemId ?? null,
        input.action,
        input.detail ?? null,
        input.createdAt,
      )
      .run();
  }
}
