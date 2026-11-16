-- Upload-only OAuth grants. Raw codes and tokens are never persisted.
CREATE TABLE IF NOT EXISTS mcp_grants (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_mcp_grants_created ON mcp_grants(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_grants_expires ON mcp_grants(expires_at);

CREATE TABLE IF NOT EXISTS mcp_tokens (
  token_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES mcp_grants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('code', 'access', 'refresh')),
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  redirect_uri TEXT,
  code_challenge TEXT
);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_expires ON mcp_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_grant ON mcp_tokens(grant_id);
