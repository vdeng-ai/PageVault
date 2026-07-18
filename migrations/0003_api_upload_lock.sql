CREATE TABLE IF NOT EXISTS api_upload_lock (
  name TEXT PRIMARY KEY CHECK (name = 'global'),
  owner TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
