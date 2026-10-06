CREATE INDEX IF NOT EXISTS idx_html_items_content_type_created_at
  ON html_items(content_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_html_items_status_created_at
  ON html_items(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_html_items_visibility_created_at
  ON html_items(visibility, created_at DESC);
