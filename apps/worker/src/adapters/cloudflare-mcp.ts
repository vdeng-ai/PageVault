import type { AppBindings } from "../bindings.js";
import { McpStore } from "../mcp/store.js";

export function mcpStoreFromEnv(env: AppBindings): McpStore {
  const db = env.DB;
  if (!db) throw new Error("D1 binding is required for MCP OAuth");
  return new McpStore({
    first: <T>(sql: string, values: (string | number | null)[]) =>
      db
        .prepare(sql)
        .bind(...values)
        .first<T>(),
    all: async <T>(sql: string, values: (string | number | null)[]) =>
      (
        await db
          .prepare(sql)
          .bind(...values)
          .all<T>()
      ).results,
    run: async (sql, values) => {
      await db
        .prepare(sql)
        .bind(...values)
        .run();
    },
    batch: async (statements) => {
      await db.batch(
        statements.map(({ sql, values }) => db.prepare(sql).bind(...values)),
      );
    },
  });
}
