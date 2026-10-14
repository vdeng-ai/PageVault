-- Existing items retain their titles and use the file-type/size fallback.
ALTER TABLE html_items ADD COLUMN share_description TEXT;
