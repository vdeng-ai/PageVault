CREATE TABLE IF NOT EXISTS maintenance_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_maintenance_state_updated_at
  ON maintenance_state(updated_at);
