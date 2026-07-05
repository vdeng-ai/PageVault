import type { HtmlItem, ItemStatus, Visibility } from "@htmlbed/core";

export interface HtmlItemRow {
  id: string;
  title: string;
  original_filename: string;
  slug: string;
  object_key: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  visibility: Visibility;
  status: ItemStatus;
  url_expires_at: string;
  file_expires_at: string;
  access_count: number;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function mapItemRow(row: HtmlItemRow): HtmlItem {
  return {
    id: row.id,
    title: row.title,
    originalFilename: row.original_filename,
    slug: row.slug,
    objectKey: row.object_key,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    visibility: row.visibility,
    status: row.status,
    urlExpiresAt: row.url_expires_at,
    fileExpiresAt: row.file_expires_at,
    accessCount: row.access_count,
    lastAccessedAt: row.last_accessed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

export function itemToRowValues(item: HtmlItem): Array<string | number | null> {
  return [
    item.id,
    item.title,
    item.originalFilename,
    item.slug,
    item.objectKey,
    item.contentType,
    item.sizeBytes,
    item.sha256,
    item.visibility,
    item.status,
    item.urlExpiresAt,
    item.fileExpiresAt,
    item.accessCount,
    item.lastAccessedAt,
    item.createdAt,
    item.updatedAt,
    item.deletedAt
  ];
}

export const insertItemSql = `
  INSERT INTO html_items (
    id, title, original_filename, slug, object_key, content_type, size_bytes, sha256,
    visibility, status, url_expires_at, file_expires_at, access_count, last_accessed_at,
    created_at, updated_at, deleted_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export interface ListSqlParts {
  whereSql: string;
  values: Array<string | number | null>;
}

export function buildListWhere(input: {
  q?: string;
  status?: string;
  visibility?: string;
  includeDeleted?: boolean;
}): ListSqlParts {
  const conditions: string[] = [];
  const values: Array<string | number | null> = [];
  const now = new Date().toISOString();

  if (input.q?.trim()) {
    conditions.push("(title LIKE ? OR original_filename LIKE ? OR slug LIKE ?)");
    const value = `%${input.q.trim()}%`;
    values.push(value, value, value);
  }

  if (input.visibility === "public" || input.visibility === "private") {
    conditions.push("visibility = ?");
    values.push(input.visibility);
  }

  switch (input.status) {
    case "active":
      conditions.push("status = 'active'");
      conditions.push("visibility = 'public'");
      conditions.push("url_expires_at > ?");
      conditions.push("file_expires_at > ?");
      values.push(now, now);
      break;
    case "private":
      conditions.push("status = 'active'");
      conditions.push("visibility = 'private'");
      break;
    case "disabled":
      conditions.push("status = 'disabled'");
      break;
    case "deleted":
      conditions.push("status = 'deleted'");
      break;
    case "url_expired":
      conditions.push("status = 'active'");
      conditions.push("visibility = 'public'");
      conditions.push("file_expires_at > ?");
      conditions.push("url_expires_at <= ?");
      values.push(now, now);
      break;
    case "file_expired":
      conditions.push("status = 'active'");
      conditions.push("visibility = 'public'");
      conditions.push("file_expires_at <= ?");
      values.push(now);
      break;
    default:
      if (!input.includeDeleted) {
        conditions.push("status != 'deleted'");
      }
  }

  return {
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    values
  };
}
