import fs from "fs/promises";
import path from "path";
import { initDatabase, isPostgresEnabled, query, pool } from "../lib/db.js";

if (!isPostgresEnabled()) {
  console.error("DATABASE_URL is required for PostgreSQL migration.");
  process.exit(1);
}

const root = process.cwd();
const libraryPath = path.join(root, "content", "library.json");
const usersPath = path.join(root, "content", "users.json");
const interactionsPath = path.join(root, "content", "interactions.json");
const resetsPath = path.join(root, "content", "password-resets.json");
const verificationsPath = path.join(root, "content", "email-verifications.json");

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

await initDatabase();
const library = await readJson(libraryPath, { series: [] });
const users = await readJson(usersPath, { users: [] });
const interactions = await readJson(interactionsPath, { bookmarks: [], progress: [], comments: [] });
const resets = await readJson(resetsPath, { resets: [] });
const verifications = await readJson(verificationsPath, { verifications: [] });

for (const user of users.users) {
  await query(
    `INSERT INTO users (id, email, username, password_hash, role, session_version, email_verified, email_verified_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO NOTHING`,
    [
      user.id,
      user.email,
      user.username,
      user.passwordHash,
      user.role,
      user.sessionVersion || 1,
      Boolean(user.emailVerified),
      user.emailVerifiedAt || null,
      user.createdAt,
    ],
  );
}

for (const series of library.series) {
  await query(
    `INSERT INTO series (id, slug, title, short_description, description, cover_image, cover_thumb_image, banner_image, banner_thumb_image, author, artist, status, type, featured, mature, updated_at, tags, genres)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [
      series.id,
      series.slug,
      series.title,
      series.shortDescription,
      series.description,
      series.coverImage,
      series.coverThumbImage || series.coverImage,
      series.bannerImage,
      series.bannerThumbImage || series.bannerImage,
      series.author,
      series.artist,
      series.status,
      series.type,
      series.featured,
      series.mature,
      series.updatedAt,
      JSON.stringify(series.tags || []),
      JSON.stringify(series.genres || []),
    ],
  );

  for (const chapter of series.chapters || []) {
    await query(
      `INSERT INTO chapters (id, series_id, title, slug, number, published_at, pages, estimated_minutes)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
       ON CONFLICT (id) DO NOTHING`,
      [chapter.id, series.id, chapter.title, chapter.slug, chapter.number, chapter.publishedAt, JSON.stringify(chapter.pages || []), chapter.estimatedMinutes || null],
    );
  }
}

for (const bookmark of interactions.bookmarks || []) {
  await query(
    `INSERT INTO bookmarks (id, user_id, series_slug, chapter_slug, chapter_label, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, series_slug) DO UPDATE SET chapter_slug = EXCLUDED.chapter_slug, chapter_label = EXCLUDED.chapter_label, updated_at = EXCLUDED.updated_at`,
    [bookmark.id || `bookmark_${Date.now()}`, bookmark.userId, bookmark.seriesSlug, bookmark.chapterSlug, bookmark.chapterLabel, bookmark.updatedAt || new Date().toISOString()],
  );
}

for (const progress of interactions.progress || []) {
  await query(
    `INSERT INTO reading_progress (id, user_id, series_slug, chapter_slug, chapter_label, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, series_slug) DO UPDATE SET chapter_slug = EXCLUDED.chapter_slug, chapter_label = EXCLUDED.chapter_label, updated_at = EXCLUDED.updated_at`,
    [progress.id || `progress_${Date.now()}`, progress.userId, progress.seriesSlug, progress.chapterSlug, progress.chapterLabel, progress.updatedAt || new Date().toISOString()],
  );
}

for (const comment of interactions.comments || []) {
  await query(
    `INSERT INTO comments (id, user_id, series_slug, chapter_slug, body, created_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO NOTHING`,
    [comment.id || `comment_${Date.now()}`, comment.userId, comment.seriesSlug, comment.chapterSlug, comment.body, comment.createdAt || new Date().toISOString()],
  );
}

for (const reset of resets.resets || []) {
  await query(
    `INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO NOTHING`,
    [reset.id || `reset_${Date.now()}`, reset.userId, reset.tokenHash, reset.expiresAt, reset.createdAt || new Date().toISOString()],
  );
}

for (const verification of verifications.verifications || []) {
  await query(
    `INSERT INTO email_verifications (id, user_id, token_hash, expires_at, created_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO NOTHING`,
    [verification.id || `verify_${Date.now()}`, verification.userId, verification.tokenHash, verification.expiresAt, verification.createdAt || new Date().toISOString()],
  );
}

console.log("Migration complete.");
await pool.end();
