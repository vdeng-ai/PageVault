CREATE TABLE IF NOT EXISTS html_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL DEFAULT 'text/html; charset=utf-8',
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,

  visibility TEXT NOT NULL DEFAULT 'public',
  status TEXT NOT NULL DEFAULT 'active',

  url_expires_at TEXT NOT NULL,
  file_expires_at TEXT NOT NULL,

  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_html_items_slug ON html_items(slug);
CREATE INDEX IF NOT EXISTS idx_html_items_status ON html_items(status);
CREATE INDEX IF NOT EXISTS idx_html_items_visibility ON html_items(visibility);
CREATE INDEX IF NOT EXISTS idx_html_items_url_expires_at ON html_items(url_expires_at);
CREATE INDEX IF NOT EXISTS idx_html_items_file_expires_at ON html_items(file_expires_at);
CREATE INDEX IF NOT EXISTS idx_html_items_created_at ON html_items(created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  item_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_item_id ON audit_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS access_logs (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_logs_item_id ON access_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON access_logs(created_at);
