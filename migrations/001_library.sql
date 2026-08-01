CREATE TABLE IF NOT EXISTS quickgram_downloads (
  id TEXT PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL,
  chat_id BIGINT NOT NULL,
  source_url TEXT,
  shortcode TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quickgram_media (
  id TEXT PRIMARY KEY,
  download_id TEXT NOT NULL REFERENCES quickgram_downloads(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
  telegram_file_id TEXT NOT NULL,
  telegram_file_unique_id TEXT,
  file_size BIGINT,
  width INTEGER,
  height INTEGER,
  duration INTEGER,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quickgram_downloads_user_created_idx
  ON quickgram_downloads (telegram_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS quickgram_media_download_order_idx
  ON quickgram_media (download_id, order_index ASC);

CREATE INDEX IF NOT EXISTS quickgram_media_user_idx
  ON quickgram_media (telegram_user_id);
