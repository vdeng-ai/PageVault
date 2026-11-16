import type { AuditLogInput } from "@pagevault/core";

export interface BoundSql {
  sql: string;
  values: (string | number | null)[];
}

export function deletionStatements(
  ids: string[],
  deletedAt: string,
): BoundSql[] {
  const result: BoundSql[] = [];
  for (let offset = 0; offset < ids.length; offset += 90) {
    const chunk = ids.slice(offset, offset + 90);
    result.push({
      sql: `UPDATE html_items SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id IN (${chunk.map(() => "?").join(",")})`,
      values: [deletedAt, deletedAt, ...chunk],
    });
  }
  return result;
}

export function auditStatements(input: AuditLogInput[]): BoundSql[] {
  const result: BoundSql[] = [];
  // Five columns × twenty rows = the D1 limit of 100 bound parameters.
  for (let offset = 0; offset < input.length; offset += 20) {
    const chunk = input.slice(offset, offset + 20);
    result.push({
      sql: `INSERT INTO audit_logs (id, item_id, action, detail, created_at) VALUES ${chunk.map(() => "(?,?,?,?,?)").join(",")}`,
      values: chunk.flatMap((row) => [
        row.id,
        row.itemId ?? null,
        row.action,
        row.detail ?? null,
        row.createdAt,
      ]),
    });
  }
  return result;
}
