import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL || "";
const dbEnabled = Boolean(databaseUrl);

export const pool = dbEnabled
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.PGSSL === "require" ? { rejectUnauthorized: false } : undefined,
    })
  : null;

export function isPostgresEnabled() {
  return dbEnabled;
}

export async function query(text, params = []) {
  if (!pool) throw new Error("PostgreSQL is not enabled. Set DATABASE_URL first.");
  return pool.query(text, params);
}

export async function initDatabase() {
  if (!pool) return false;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'reader',
      session_version INTEGER NOT NULL DEFAULT 1,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      email_verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS series (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      short_description TEXT NOT NULL,
      description TEXT NOT NULL,
      cover_image TEXT NOT NULL,
      cover_thumb_image TEXT,
      banner_image TEXT NOT NULL,
      banner_thumb_image TEXT,
      author TEXT NOT NULL,
      artist TEXT NOT NULL,
      status TEXT NOT NULL,
      type TEXT NOT NULL,
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      mature BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      genres JSONB NOT NULL DEFAULT '[]'::jsonb
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      number NUMERIC NOT NULL,
      published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      pages JSONB NOT NULL DEFAULT '[]'::jsonb,
      estimated_minutes INTEGER,
      UNIQUE(series_id, slug),
      UNIQUE(series_id, number)
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      series_slug TEXT NOT NULL,
      chapter_slug TEXT NOT NULL,
      chapter_label TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, series_slug)
    );

    CREATE TABLE IF NOT EXISTS reading_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      series_slug TEXT NOT NULL,
      chapter_slug TEXT NOT NULL,
      chapter_label TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, series_slug)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      series_slug TEXT NOT NULL,
      chapter_slug TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS token_hash TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_password_resets_token_hash ON password_resets(token_hash);

    CREATE TABLE IF NOT EXISTS email_verifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_email_verifications_token_hash ON email_verifications(token_hash);
    CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id);

    CREATE TABLE IF NOT EXISTS rate_limits (
      bucket TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (bucket, subject_key, window_start)
    );

    CREATE INDEX IF NOT EXISTS idx_chapters_series_id ON chapters(series_id);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
    CREATE INDEX IF NOT EXISTS idx_progress_user_id ON reading_progress(user_id);
    CREATE INDEX IF NOT EXISTS idx_comments_series_chapter ON comments(series_slug, chapter_slug, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
  `);
  return true;
}
