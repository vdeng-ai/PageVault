import { AppError, type MetadataRepository } from "@pagevault/core";
import type {
  AccessCountInput,
  ApiKey,
  AuditLogInput,
  ApiUploadIdempotencyClaim,
  ClaimApiUploadIdempotencyInput,
  CreateApiKeyInput,
  CreateItemInput,
  DashboardStats,
  VaultItem,
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
  total_size_bytes: number;
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

  async claimApiUploadIdempotency(
    input: ClaimApiUploadIdempotencyInput,
  ): Promise<ApiUploadIdempotencyClaim> {
    const result = await this.db
      .prepare(`
          INSERT INTO api_upload_idempotency (
            api_key_id,
            idempotency_key,
            request_hash,
            item_id,
            status,
            owner,
            created_at,
            updated_at,
            expires_at
          )
          VALUES (?, ?, ?, ?, 'processing', ?, ?, ?, ?)
          ON CONFLICT(api_key_id, idempotency_key) DO UPDATE SET
            request_hash = CASE
              WHEN api_upload_idempotency.status = 'processing'
                AND api_upload_idempotency.request_hash = excluded.request_hash
              THEN api_upload_idempotency.request_hash
              ELSE excluded.request_hash
            END,
            item_id = CASE
              WHEN api_upload_idempotency.status = 'processing'
                AND api_upload_idempotency.request_hash = excluded.request_hash
              THEN api_upload_idempotency.item_id
              ELSE excluded.item_id
            END,
            status = 'processing',
            owner = excluded.owner,
            updated_at = excluded.updated_at,
            expires_at = excluded.expires_at
          WHERE api_upload_idempotency.expires_at <= excluded.updated_at
        `)
      .bind(
        input.apiKeyId,
        input.idempotencyKey,
        input.requestHash,
        input.candidateItemId,
        input.owner,
        input.now,
        input.now,
        input.expiresAt,
      )
      .run();

    const row = await this.db
      .prepare(
        `SELECT request_hash, item_id, status, owner
         FROM api_upload_idempotency
         WHERE api_key_id = ? AND idempotency_key = ?
         LIMIT 1`,
      )
      .bind(input.apiKeyId, input.idempotencyKey)
      .first<{
        request_hash: string;
        item_id: string;
        status: "processing" | "completed";
        owner: string;
      }>();
    if (!row) {
      throw new AppError(
        "Idempotency record is unavailable",
        500,
        "idempotency_state_error",
      );
    }
    if (row.request_hash !== input.requestHash) {
      return { kind: "conflict", itemId: row.item_id };
    }
    if (row.status === "completed") {
      return { kind: "completed", itemId: row.item_id };
    }
    return result.meta.changes > 0 && row.owner === input.owner
      ? { kind: "acquired", itemId: row.item_id }
      : { kind: "in_progress", itemId: row.item_id };
  }

  async completeApiUploadIdempotency(
    apiKeyId: string,
    idempotencyKey: string,
    owner: string,
    updatedAt: string,
    expiresAt: string,
  ): Promise<void> {
    const result = await this.db
      .prepare(
        `UPDATE api_upload_idempotency
         SET status = 'completed', updated_at = ?, expires_at = ?
         WHERE api_key_id = ? AND idempotency_key = ?
           AND status = 'processing' AND owner = ?`,
      )
      .bind(updatedAt, expiresAt, apiKeyId, idempotencyKey, owner)
      .run();
    if (result.meta.changes === 0) {
      throw new AppError(
        "Idempotency claim was lost before completion",
        409,
        "idempotency_claim_lost",
      );
    }
  }

  async abandonApiUploadIdempotency(
    apiKeyId: string,
    idempotencyKey: string,
    owner: string,
  ): Promise<void> {
    await this.db
      .prepare(
        `DELETE FROM api_upload_idempotency
         WHERE api_key_id = ? AND idempotency_key = ?
           AND status = 'processing' AND owner = ?`,
      )
      .bind(apiKeyId, idempotencyKey, owner)
      .run();
  }

  async deleteExpiredApiUploadIdempotency(
    now: string,
    limit: number,
  ): Promise<number> {
    const result = await this.db
      .prepare(
        `DELETE FROM api_upload_idempotency
         WHERE rowid IN (
           SELECT rowid
           FROM api_upload_idempotency
           WHERE expires_at <= ?
           ORDER BY expires_at ASC
           LIMIT ?
         )`,
      )
      .bind(now, limit)
      .run();
    return result.meta.changes;
  }

  async createItem(input: CreateItemInput): Promise<VaultItem> {
    await this.db
      .prepare(insertItemSql)
      .bind(...itemToRowValues(input.item))
      .run();
    return input.item;
  }

  async getItemById(id: string): Promise<VaultItem | null> {
    const row = await this.db
      .prepare("SELECT * FROM html_items WHERE id = ? LIMIT 1")
      .bind(id)
      .first<HtmlItemRow>();
    return row ? mapItemRow(row) : null;
  }

  async getItemsByIds(ids: string[]): Promise<VaultItem[]> {
    const uniqueIds = Array.from(new Set(ids)).filter((id) => id.length > 0);
    if (uniqueIds.length === 0) {
      return [];
    }

    const items: VaultItem[] = [];
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

  async getItemBySlug(slug: string): Promise<VaultItem | null> {
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
            COALESCE(SUM(CASE WHEN status != 'deleted' THEN size_bytes ELSE 0 END), 0) AS total_size_bytes,
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
      totalSizeBytes: row?.total_size_bytes ?? 0,
      publicCount: row?.public_count ?? 0,
      urlExpired: row?.url_expired ?? 0,
      fileDeletingSoon: row?.file_deleting_soon ?? 0,
      deleted: row?.deleted ?? 0,
    };
  }

  async updateItem(id: string, patch: UpdateItemInput): Promise<VaultItem> {
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

  async findExpiredFiles(now: string, limit: number): Promise<VaultItem[]> {
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
