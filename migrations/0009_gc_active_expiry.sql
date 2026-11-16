-- Do not repeatedly scan old deleted rows during daily retention cleanup.
CREATE INDEX IF NOT EXISTS idx_html_items_live_expiry
  ON html_items(file_expires_at) WHERE status != 'deleted';
