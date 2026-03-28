import fs from "fs/promises";
import path from "path";
import { isPostgresEnabled, query } from "./db.js";

const interactionsFile = path.join(process.cwd(), "content", "interactions.json");

async function ensureInteractionsFile() {
  await fs.mkdir(path.dirname(interactionsFile), { recursive: true });
  try {
    await fs.access(interactionsFile);
  } catch {
    await fs.writeFile(interactionsFile, JSON.stringify({ bookmarks: [], progress: [], comments: [] }, null, 2), "utf8");
  }
}

async function getStore() {
  await ensureInteractionsFile();
  const raw = await fs.readFile(interactionsFile, "utf8");
  return JSON.parse(raw);
}

async function saveStore(store) {
  await ensureInteractionsFile();
  await fs.writeFile(interactionsFile, JSON.stringify(store, null, 2), "utf8");
}

export async function deleteSeriesInteractions(seriesSlug) {
  if (isPostgresEnabled()) {
    await Promise.all([
      query("DELETE FROM bookmarks WHERE series_slug = $1", [seriesSlug]),
      query("DELETE FROM reading_progress WHERE series_slug = $1", [seriesSlug]),
      query("DELETE FROM comments WHERE series_slug = $1", [seriesSlug]),
    ]);
    return true;
  }

  const store = await getStore();
  store.bookmarks = store.bookmarks.filter((item) => item.seriesSlug !== seriesSlug);
  store.progress = store.progress.filter((item) => item.seriesSlug !== seriesSlug);
  store.comments = store.comments.filter((item) => item.seriesSlug !== seriesSlug);
  await saveStore(store);
  return true;
}

export async function deleteChapterInteractions(seriesSlug, chapterSlug) {
  if (isPostgresEnabled()) {
    await Promise.all([
      query("DELETE FROM bookmarks WHERE series_slug = $1 AND chapter_slug = $2", [seriesSlug, chapterSlug]),
      query("DELETE FROM reading_progress WHERE series_slug = $1 AND chapter_slug = $2", [seriesSlug, chapterSlug]),
      query("DELETE FROM comments WHERE series_slug = $1 AND chapter_slug = $2", [seriesSlug, chapterSlug]),
    ]);
    return true;
  }

  const store = await getStore();
  store.bookmarks = store.bookmarks.filter((item) => item.seriesSlug !== seriesSlug || item.chapterSlug !== chapterSlug);
  store.progress = store.progress.filter((item) => item.seriesSlug !== seriesSlug || item.chapterSlug !== chapterSlug);
  store.comments = store.comments.filter((item) => item.seriesSlug !== seriesSlug || item.chapterSlug !== chapterSlug);
  await saveStore(store);
  return true;
}

export async function getBookmarksForUser(userId) {
  if (isPostgresEnabled()) {
    const result = await query("SELECT * FROM bookmarks WHERE user_id = $1 ORDER BY updated_at DESC", [userId]);
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      seriesSlug: row.series_slug,
      chapterSlug: row.chapter_slug,
      chapterLabel: row.chapter_label,
      updatedAt: row.updated_at,
    }));
  }

  const store = await getStore();
  return store.bookmarks.filter((item) => item.userId === userId).sort((a, b) => Number(new Date(b.updatedAt)) - Number(new Date(a.updatedAt)));
}

export async function isSeriesBookmarked(userId, seriesSlug) {
  const bookmarks = await getBookmarksForUser(userId);
  return bookmarks.some((item) => item.seriesSlug === seriesSlug);
}

export async function toggleBookmark(userId, payload) {
  if (isPostgresEnabled()) {
    const existing = await query("SELECT id FROM bookmarks WHERE user_id = $1 AND series_slug = $2 LIMIT 1", [userId, payload.seriesSlug]);
    if (existing.rows[0]) {
      await query("DELETE FROM bookmarks WHERE id = $1", [existing.rows[0].id]);
      return { active: false };
    }

    await query(
      `INSERT INTO bookmarks (id, user_id, series_slug, chapter_slug, chapter_label, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [`bookmark_${Date.now()}`, userId, payload.seriesSlug, payload.chapterSlug, payload.chapterLabel, new Date().toISOString()],
    );
    return { active: true };
  }

  const store = await getStore();
  const index = store.bookmarks.findIndex((item) => item.userId === userId && item.seriesSlug === payload.seriesSlug);
  if (index >= 0) {
    store.bookmarks.splice(index, 1);
    await saveStore(store);
    return { active: false };
  }

  store.bookmarks.unshift({
    id: `bookmark_${Date.now()}`,
    userId,
    seriesSlug: payload.seriesSlug,
    chapterSlug: payload.chapterSlug,
    chapterLabel: payload.chapterLabel,
    updatedAt: new Date().toISOString(),
  });
  await saveStore(store);
  return { active: true };
}

export async function getProgressForUser(userId) {
  if (isPostgresEnabled()) {
    const result = await query("SELECT * FROM reading_progress WHERE user_id = $1 ORDER BY updated_at DESC", [userId]);
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      seriesSlug: row.series_slug,
      chapterSlug: row.chapter_slug,
      chapterLabel: row.chapter_label,
      updatedAt: row.updated_at,
    }));
  }

  const store = await getStore();
  return store.progress.filter((item) => item.userId === userId).sort((a, b) => Number(new Date(b.updatedAt)) - Number(new Date(a.updatedAt)));
}

export async function upsertProgress(userId, payload) {
  if (isPostgresEnabled()) {
    await query(
      `INSERT INTO reading_progress (id, user_id, series_slug, chapter_slug, chapter_label, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, series_slug)
       DO UPDATE SET chapter_slug = EXCLUDED.chapter_slug, chapter_label = EXCLUDED.chapter_label, updated_at = EXCLUDED.updated_at`,
      [`progress_${Date.now()}`, userId, payload.seriesSlug, payload.chapterSlug, payload.chapterLabel, new Date().toISOString()],
    );
    return true;
  }

  const store = await getStore();
  const filtered = store.progress.filter((item) => item.userId !== userId || item.seriesSlug !== payload.seriesSlug);
  filtered.unshift({
    id: `progress_${Date.now()}`,
    userId,
    seriesSlug: payload.seriesSlug,
    chapterSlug: payload.chapterSlug,
    chapterLabel: payload.chapterLabel,
    updatedAt: new Date().toISOString(),
  });
  store.progress = filtered.slice(0, 50);
  await saveStore(store);
  return true;
}

export async function getCommentsForChapter(seriesSlug, chapterSlug) {
  if (isPostgresEnabled()) {
    const result = await query(
      `SELECT comments.id, comments.series_slug, comments.chapter_slug, comments.body, comments.created_at, users.username, users.id AS user_id
       FROM comments
       JOIN users ON users.id = comments.user_id
       WHERE comments.series_slug = $1 AND comments.chapter_slug = $2
       ORDER BY comments.created_at DESC`,
      [seriesSlug, chapterSlug],
    );
    return result.rows.map((row) => ({
      id: row.id,
      seriesSlug: row.series_slug,
      chapterSlug: row.chapter_slug,
      body: row.body,
      createdAt: row.created_at,
      username: row.username,
      userId: row.user_id,
    }));
  }

  const store = await getStore();
  return store.comments.filter((item) => item.seriesSlug === seriesSlug && item.chapterSlug === chapterSlug).sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)));
}

export async function getRecentComments(limit = 20) {
  if (isPostgresEnabled()) {
    const result = await query(
      `SELECT comments.id, comments.series_slug, comments.chapter_slug, comments.body, comments.created_at, users.username, users.id AS user_id
       FROM comments
       JOIN users ON users.id = comments.user_id
       ORDER BY comments.created_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      seriesSlug: row.series_slug,
      chapterSlug: row.chapter_slug,
      body: row.body,
      createdAt: row.created_at,
      username: row.username,
      userId: row.user_id,
    }));
  }

  const store = await getStore();
  return [...store.comments].sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt))).slice(0, limit);
}

export async function addComment(user, payload) {
  const body = payload.body.trim();
  if (!body) throw new Error("Comment body cannot be empty.");
  if (body.length > 1200) throw new Error("Comment is too long.");

  if (isPostgresEnabled()) {
    await query(
      `INSERT INTO comments (id, user_id, series_slug, chapter_slug, body, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [`comment_${Date.now()}`, user.id, payload.seriesSlug, payload.chapterSlug, body, new Date().toISOString()],
    );
    return true;
  }

  const store = await getStore();
  store.comments.unshift({
    id: `comment_${Date.now()}`,
    userId: user.id,
    username: user.username,
    seriesSlug: payload.seriesSlug,
    chapterSlug: payload.chapterSlug,
    body,
    createdAt: new Date().toISOString(),
  });
  await saveStore(store);
  return true;
}

export async function deleteComment(commentId, actor) {
  if (isPostgresEnabled()) {
    const result = await query("SELECT * FROM comments WHERE id = $1 LIMIT 1", [commentId]);
    const comment = result.rows[0];
    if (!comment) throw new Error("Comment not found.");
    if (actor.role !== "admin" && comment.user_id !== actor.id) throw new Error("You cannot delete this comment.");
    await query("DELETE FROM comments WHERE id = $1", [commentId]);
    return true;
  }

  const store = await getStore();
  const comment = store.comments.find((item) => item.id === commentId);
  if (!comment) throw new Error("Comment not found.");
  if (actor.role !== "admin" && comment.userId !== actor.id) throw new Error("You cannot delete this comment.");
  store.comments = store.comments.filter((item) => item.id !== commentId);
  await saveStore(store);
  return true;
}
