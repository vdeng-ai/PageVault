import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { AppError, type MetadataRepository } from "@htmlbed/core";
import type {
  AccessCountInput,
  AuditLogInput,
  CreateItemInput,
  DashboardStats,
  HtmlItem,
  ListItemsInput,
  ListItemsResult,
  UpdateItemInput
} from "@htmlbed/core";
import {
  buildListWhere,
  insertItemSql,
  itemToRowValues,
  mapItemRow,
  type HtmlItemRow
} from "./item-row.js";

type BindValue = string | number | null;

interface CountRow {
  total: number;
}

interface DashboardStatsRow {
  total: number;
  public_count: number;
  url_expired: number;
  file_deleting_soon: number;
  deleted: number;
}

function stringField(row: Record<string, SQLOutputValue>, key: keyof HtmlItemRow): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new AppError(`Invalid SQLite row field: ${String(key)}`, 500, "invalid_sqlite_row");
  }
  return value;
}

function nullableStringField(row: Record<string, SQLOutputValue>, key: keyof HtmlItemRow): string | null {
  const value = row[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new AppError(`Invalid SQLite row field: ${String(key)}`, 500, "invalid_sqlite_row");
  }
  return value;
}

function numberField(row: Record<string, SQLOutputValue>, key: keyof HtmlItemRow): number {
  const value = row[key];
  if (typeof value !== "number") {
    throw new AppError(`Invalid SQLite row field: ${String(key)}`, 500, "invalid_sqlite_row");
  }
  return value;
}

function htmlItemRow(row: Record<string, SQLOutputValue>): HtmlItemRow {
  return {
    id: stringField(row, "id"),
    title: stringField(row, "title"),
    original_filename: stringField(row, "original_filename"),
    slug: stringField(row, "slug"),
    object_key: stringField(row, "object_key"),
    content_type: stringField(row, "content_type"),
    size_bytes: numberField(row, "size_bytes"),
    sha256: stringField(row, "sha256"),
    visibility: stringField(row, "visibility") === "private" ? "private" : "public",
    status: stringField(row, "status") === "deleted" ? "deleted" : stringField(row, "status") === "disabled" ? "disabled" : "active",
    url_expires_at: stringField(row, "url_expires_at"),
    file_expires_at: stringField(row, "file_expires_at"),
    access_count: numberField(row, "access_count"),
    last_accessed_at: nullableStringField(row, "last_accessed_at"),
    created_at: stringField(row, "created_at"),
    updated_at: stringField(row, "updated_at"),
    deleted_at: nullableStringField(row, "deleted_at")
  };
}

function countRow(row: Record<string, SQLOutputValue> | undefined): CountRow | undefined {
  if (!row) {
    return undefined;
  }
  return { total: numberField(row, "total" as keyof HtmlItemRow) };
}

function dashboardStatsRow(
  row: Record<string, SQLOutputValue> | undefined
): DashboardStatsRow | undefined {
  if (!row) {
    return undefined;
  }
  return {
    total: numberField(row, "total" as keyof HtmlItemRow),
    public_count: numberField(row, "public_count" as keyof HtmlItemRow),
    url_expired: numberField(row, "url_expired" as keyof HtmlItemRow),
    file_deleting_soon: numberField(row, "file_deleting_soon" as keyof HtmlItemRow),
    deleted: numberField(row, "deleted" as keyof HtmlItemRow)
  };
}

export class NodeSqliteRepository implements MetadataRepository {
  constructor(private readonly db: DatabaseSync) {}

  static open(sqlitePath: string): NodeSqliteRepository {
    mkdirSync(dirname(sqlitePath), { recursive: true });
    const db = new DatabaseSync(sqlitePath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    return new NodeSqliteRepository(db);
  }

  async migrate(migrationPath: string): Promise<void> {
    const sql = await readFile(migrationPath, "utf8");
    this.db.exec(sql);
  }

  async createItem(input: CreateItemInput): Promise<HtmlItem> {
    this.db.prepare(insertItemSql).run(...itemToRowValues(input.item));
    return input.item;
  }

  async getItemById(id: string): Promise<HtmlItem | null> {
    const row = this.db
      .prepare("SELECT * FROM html_items WHERE id = ? LIMIT 1")
      .get(id);
    return row ? mapItemRow(htmlItemRow(row)) : null;
  }

  async getItemBySlug(slug: string): Promise<HtmlItem | null> {
    const row = this.db
      .prepare("SELECT * FROM html_items WHERE slug = ? LIMIT 1")
      .get(slug);
    return row ? mapItemRow(htmlItemRow(row)) : null;
  }

  async listItems(input: ListItemsInput): Promise<ListItemsResult> {
    const page = Math.max(1, input.page);
    const pageSize = Math.min(Math.max(1, input.pageSize), 100);
    const offset = (page - 1) * pageSize;
    const { whereSql, values } = buildListWhere(input);
    const totalRow = countRow(
      this.db
      .prepare(`SELECT COUNT(*) AS total FROM html_items ${whereSql}`)
        .get(...values)
    );
    const rows = this.db
      .prepare(`SELECT * FROM html_items ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...values, pageSize, offset);

    return {
      items: rows.map((row) => mapItemRow(htmlItemRow(row))),
      page,
      pageSize,
      total: totalRow?.total ?? 0
    };
  }

  async getDashboardStats(now: string, soon: string): Promise<DashboardStats> {
    const row = dashboardStatsRow(
      this.db
        .prepare(
          `
            SELECT
              COALESCE(SUM(CASE WHEN status != 'deleted' THEN 1 ELSE 0 END), 0) AS total,
              COALESCE(SUM(CASE WHEN status = 'active' AND visibility = 'public' THEN 1 ELSE 0 END), 0) AS public_count,
              COALESCE(SUM(CASE WHEN status != 'deleted' AND url_expires_at <= ? THEN 1 ELSE 0 END), 0) AS url_expired,
              COALESCE(SUM(CASE WHEN status != 'deleted' AND file_expires_at > ? AND file_expires_at <= ? THEN 1 ELSE 0 END), 0) AS file_deleting_soon,
              COALESCE(SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END), 0) AS deleted
            FROM html_items
          `
        )
        .get(now, now, soon)
    );

    return {
      total: row?.total ?? 0,
      publicCount: row?.public_count ?? 0,
      urlExpired: row?.url_expired ?? 0,
      fileDeletingSoon: row?.file_deleting_soon ?? 0,
      deleted: row?.deleted ?? 0
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
    if (patch.urlExpiresAt !== undefined) append("url_expires_at", patch.urlExpiresAt);
    if (patch.fileExpiresAt !== undefined) append("file_expires_at", patch.fileExpiresAt);
    if (patch.updatedAt !== undefined) append("updated_at", patch.updatedAt);

    if (assignments.length > 0) {
      this.db
        .prepare(`UPDATE html_items SET ${assignments.join(", ")} WHERE id = ?`)
        .run(...values, id);
    }

    const item = await this.getItemById(id);
    if (!item) {
      throw new AppError("Item not found", 404, "item_not_found");
    }
    return item;
  }

  async markDeleted(id: string, deletedAt: string): Promise<void> {
    this.db
      .prepare("UPDATE html_items SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?")
      .run(deletedAt, deletedAt, id);
  }

  async incrementAccess(id: string, accessedAt: string): Promise<void> {
    await this.incrementAccessBatch([{ id, count: 1, accessedAt }]);
  }

  async incrementAccessBatch(input: AccessCountInput[]): Promise<void> {
    if (input.length === 0) {
      return;
    }
    const statement = this.db.prepare(
      "UPDATE html_items SET access_count = access_count + ?, last_accessed_at = ? WHERE id = ?"
    );
    this.db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      for (const entry of input) {
        statement.run(entry.count, entry.accessedAt, entry.id);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async findExpiredFiles(now: string, limit: number): Promise<HtmlItem[]> {
    const rows = this.db
      .prepare(
        "SELECT * FROM html_items WHERE file_expires_at <= ? AND status != 'deleted' ORDER BY file_expires_at ASC LIMIT ?"
      )
      .all(now, limit);
    return rows.map((row) => mapItemRow(htmlItemRow(row)));
  }

  async writeAuditLog(input: AuditLogInput): Promise<void> {
    this.db
      .prepare("INSERT INTO audit_logs (id, item_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(input.id, input.itemId ?? null, input.action, input.detail ?? null, input.createdAt);
  }
}
