CREATE TABLE IF NOT EXISTS api_upload_idempotency (
  api_key_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  item_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed')),
  owner TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (api_key_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_api_upload_idempotency_expires_at
  ON api_upload_idempotency(expires_at);

CREATE INDEX IF NOT EXISTS idx_api_upload_idempotency_item_id
  ON api_upload_idempotency(item_id);
