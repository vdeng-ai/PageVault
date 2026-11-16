export type SqlValue = string | number | null;
export interface SqlStatement {
  sql: string;
  values: SqlValue[];
}
export interface McpSql {
  first<T>(sql: string, values: SqlValue[]): Promise<T | null>;
  all<T>(sql: string, values: SqlValue[]): Promise<T[]>;
  run(sql: string, values: SqlValue[]): Promise<void>;
  batch(statements: SqlStatement[]): Promise<void>;
}

export interface McpGrant {
  id: string;
  client_id: string;
  resource: string;
  scope: string;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
}
export interface McpToken extends McpGrant {
  token_hash: string;
  kind: "code" | "access" | "refresh";
  token_expires_at: number;
  used_at: number | null;
  redirect_uri: string | null;
  code_challenge: string | null;
}
export interface NewMcpToken {
  hash: string;
  grantId: string;
  kind: McpToken["kind"];
  expiresAt: number;
  redirectUri?: string;
  challenge?: string;
}

function tokenStatement(token: NewMcpToken): SqlStatement {
  return {
    sql: `INSERT INTO mcp_tokens
      (token_hash, grant_id, kind, expires_at, redirect_uri, code_challenge)
      VALUES (?, ?, ?, ?, ?, ?)`,
    values: [
      token.hash,
      token.grantId,
      token.kind,
      token.expiresAt,
      token.redirectUri ?? null,
      token.challenge ?? null,
    ],
  };
}

/** Identical SQL on D1 and SQLite; no protocol session or additional database. */
export class McpStore {
  constructor(private readonly db: McpSql) {}

  async createGrant(grant: McpGrant, code: NewMcpToken): Promise<void> {
    await this.db.batch([
      {
        sql: `INSERT INTO mcp_grants
          (id, client_id, resource, scope, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
        values: [
          grant.id,
          grant.client_id,
          grant.resource,
          grant.scope,
          grant.created_at,
          grant.expires_at,
        ],
      },
      tokenStatement(code),
    ]);
  }

  getToken(hash: string): Promise<McpToken | null> {
    return this.db.first<McpToken>(
      `SELECT g.*, t.token_hash, t.kind, t.expires_at AS token_expires_at,
       t.used_at, t.redirect_uri, t.code_challenge
       FROM mcp_tokens t JOIN mcp_grants g ON g.id = t.grant_id
       WHERE t.token_hash = ? LIMIT 1`,
      [hash],
    );
  }

  async consume(hash: string, now: number): Promise<boolean> {
    // Atomic compare-and-set: concurrent code exchanges/refreshes cannot both win.
    const row = await this.db.first<{ token_hash: string }>(
      `UPDATE mcp_tokens SET used_at = ?
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
       RETURNING token_hash`,
      [now, hash, now],
    );
    return row !== null;
  }

  async issue(tokens: NewMcpToken[]): Promise<void> {
    await this.db.batch(tokens.map(tokenStatement));
  }

  async revoke(id: string, now: number): Promise<void> {
    await this.db.run(
      "UPDATE mcp_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
      [now, id],
    );
  }

  list(): Promise<McpGrant[]> {
    return this.db.all<McpGrant>(
      "SELECT * FROM mcp_grants ORDER BY created_at DESC LIMIT 100",
      [],
    );
  }

  async prune(now: number): Promise<void> {
    // Retain consumed refresh tokens until expiry so reuse revokes the whole grant.
    await this.db.run(
      `DELETE FROM mcp_tokens WHERE token_hash IN
       (SELECT token_hash FROM mcp_tokens WHERE expires_at <= ?
        ORDER BY expires_at LIMIT 500)`,
      [now],
    );
    await this.db.run(
      `DELETE FROM mcp_grants WHERE id IN
       (SELECT id FROM mcp_grants WHERE expires_at <= ?
        AND NOT EXISTS (SELECT 1 FROM mcp_tokens WHERE grant_id = mcp_grants.id)
        ORDER BY expires_at LIMIT 100)`,
      [now],
    );
  }
}
