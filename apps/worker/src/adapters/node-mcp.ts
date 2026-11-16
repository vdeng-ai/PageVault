import type { DatabaseSync } from "node:sqlite";
import { McpStore, type SqlValue } from "../mcp/store.js";

export function nodeMcpStore(db: DatabaseSync): McpStore {
  return new McpStore({
    first: async <T>(sql: string, values: SqlValue[]) =>
      (db.prepare(sql).get(...values) as T | undefined) ?? null,
    all: async <T>(sql: string, values: SqlValue[]) =>
      db.prepare(sql).all(...values) as T[],
    run: async (sql, values) => {
      db.prepare(sql).run(...values);
    },
    batch: async (statements) => {
      db.exec("BEGIN IMMEDIATE TRANSACTION");
      try {
        for (const { sql, values } of statements)
          db.prepare(sql).run(...values);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  });
}
