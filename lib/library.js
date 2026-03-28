import fs from "fs/promises";
import path from "path";
import { isPostgresEnabled, query } from "./db.js";

const contentDir = path.join(process.cwd(), "content");
const libraryFile = path.join(contentDir, "library.json");

export function slugify(value = "") {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "").slice(0, 80);
}

export async function ensureBasePaths(rootDir = process.cwd()) {
  await fs.mkdir(contentDir, { recursive: true });
  await fs.mkdir(path.join(rootDir, "public", "uploads"), { recursive: true });
  try {
    await fs.access(libraryFile);
  } catch {
    await fs.writeFile(libraryFile, JSON.stringify({ series: [] }, null, 2), "utf8");
  }
}

function normalizeSeries(series) {
  return {
    ...series,
    tags: series.tags || [],
    genres: series.genres || [],
    coverThumbImage: series.coverThumbImage || series.coverImage,
    bannerThumbImage: series.bannerThumbImage || series.bannerImage,
    chapters: [...(series.chapters || [])].sort((a, b) => Number(b.number) - Number(a.number)),
  };
}

async function getJsonLibrary() {
  await ensureBasePaths();
  const raw = await fs.readFile(libraryFile, "utf8");
  const parsed = JSON.parse(raw);
  parsed.series = parsed.series
    .map((series) => normalizeSeries(series))
    .sort((a, b) => Number(new Date(b.updatedAt)) - Number(new Date(a.updatedAt)));
  return parsed;
}

function assembleSeries(rows, chapters) {
  const map = new Map();
  for (const row of rows) {
    map.set(row.id, normalizeSeries({
      id: row.id,
      slug: row.slug,
      title: row.title,
      shortDescription: row.short_description,
      description: row.description,
      coverImage: row.cover_image,
      coverThumbImage: row.cover_thumb_image || row.cover_image,
      bannerImage: row.banner_image,
      bannerThumbImage: row.banner_thumb_image || row.banner_image,
      author: row.author,
      artist: row.artist,
      status: row.status,
      type: row.type,
      featured: row.featured,
      mature: row.mature,
      updatedAt: row.updated_at,
      tags: row.tags || [],
      genres: row.genres || [],
      chapters: [],
    }));
  }

  for (const row of chapters) {
    const series = map.get(row.series_id);
    if (!series) continue;
    series.chapters.push({
      id: row.id,
      title: row.title,
      slug: row.slug,
      number: Number(row.number),
      publishedAt: row.published_at,
      pages: row.pages || [],
      estimatedMinutes: row.estimated_minutes || undefined,
    });
  }

  return {
    series: [...map.values()].map((series) => normalizeSeries(series)).sort((a, b) => Number(new Date(b.updatedAt)) - Number(new Date(a.updatedAt))),
  };
}

export async function getLibrary() {
  if (!isPostgresEnabled()) return getJsonLibrary();
  const [seriesRows, chapterRows] = await Promise.all([
    query("SELECT * FROM series ORDER BY updated_at DESC"),
    query("SELECT * FROM chapters ORDER BY number DESC, published_at DESC"),
  ]);
  return assembleSeries(seriesRows.rows, chapterRows.rows);
}

export async function writeLibrary(library) {
  if (isPostgresEnabled()) {
    throw new Error("writeLibrary is JSON-only. Use createSeriesEntry/createChapterEntry when PostgreSQL is enabled.");
  }
  await ensureBasePaths();
  await fs.writeFile(libraryFile, JSON.stringify(library, null, 2), "utf8");
}

export async function getAllSeries() {
  const library = await getLibrary();
  return library.series;
}

export async function getSeriesBySlug(slug) {
  const library = await getLibrary();
  return library.series.find((series) => series.slug === slug) || null;
}

export async function getChapter(seriesSlug, chapterSlug) {
  const series = await getSeriesBySlug(seriesSlug);
  if (!series) return null;
  const chapter = series.chapters.find((item) => item.slug === chapterSlug);
  if (!chapter) return null;
  return { series, chapter };
}

export async function createSeriesEntry(series) {
  const payload = normalizeSeries(series);
  if (!isPostgresEnabled()) {
    const library = await getJsonLibrary();
    library.series.unshift(payload);
    await writeLibrary(library);
    return payload;
  }

  await query(
    `INSERT INTO series (id, slug, title, short_description, description, cover_image, cover_thumb_image, banner_image, banner_thumb_image, author, artist, status, type, featured, mature, updated_at, tags, genres)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb)`,
    [
      payload.id,
      payload.slug,
      payload.title,
      payload.shortDescription,
      payload.description,
      payload.coverImage,
      payload.coverThumbImage,
      payload.bannerImage,
      payload.bannerThumbImage,
      payload.author,
      payload.artist,
      payload.status,
      payload.type,
      payload.featured,
      payload.mature,
      payload.updatedAt,
      JSON.stringify(payload.tags || []),
      JSON.stringify(payload.genres || []),
    ],
  );
  return payload;
}

export async function createChapterEntry(seriesSlug, chapter) {
  const payload = { ...chapter, pages: chapter.pages || [] };
  if (!isPostgresEnabled()) {
    const library = await getJsonLibrary();
    const series = library.series.find((item) => item.slug === seriesSlug);
    if (!series) throw new Error("Series not found.");
    series.chapters.unshift(payload);
    series.updatedAt = new Date().toISOString();
    await writeLibrary(library);
    return payload;
  }

  const seriesResult = await query("SELECT id FROM series WHERE slug = $1 LIMIT 1", [seriesSlug]);
  const seriesRow = seriesResult.rows[0];
  if (!seriesRow) throw new Error("Series not found.");

  await query(
    `INSERT INTO chapters (id, series_id, title, slug, number, published_at, pages, estimated_minutes)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    [
      payload.id,
      seriesRow.id,
      payload.title,
      payload.slug,
      payload.number,
      payload.publishedAt,
      JSON.stringify(payload.pages),
      payload.estimatedMinutes || null,
    ],
  );
  await query("UPDATE series SET updated_at = NOW() WHERE id = $1", [seriesRow.id]);
  return payload;
}

export async function deleteSeriesEntry(seriesSlug) {
  if (!isPostgresEnabled()) {
    const library = await getJsonLibrary();
    const index = library.series.findIndex((item) => item.slug === seriesSlug);
    if (index === -1) throw new Error("Series not found.");
    const [removed] = library.series.splice(index, 1);
    await writeLibrary(library);
    return removed;
  }

  const result = await query("DELETE FROM series WHERE slug = $1 RETURNING *", [seriesSlug]);
  const removed = result.rows[0];
  if (!removed) throw new Error("Series not found.");
  return removed;
}

export async function deleteChapterEntry(seriesSlug, chapterSlug) {
  if (!isPostgresEnabled()) {
    const library = await getJsonLibrary();
    const series = library.series.find((item) => item.slug === seriesSlug);
    if (!series) throw new Error("Series not found.");
    const index = series.chapters.findIndex((item) => item.slug === chapterSlug);
    if (index === -1) throw new Error("Chapter not found.");
    const [removed] = series.chapters.splice(index, 1);
    series.updatedAt = new Date().toISOString();
    await writeLibrary(library);
    return removed;
  }

  const seriesResult = await query("SELECT id FROM series WHERE slug = $1 LIMIT 1", [seriesSlug]);
  const seriesRow = seriesResult.rows[0];
  if (!seriesRow) throw new Error("Series not found.");
  const result = await query("DELETE FROM chapters WHERE series_id = $1 AND slug = $2 RETURNING *", [seriesRow.id, chapterSlug]);
  const removed = result.rows[0];
  if (!removed) throw new Error("Chapter not found.");
  await query("UPDATE series SET updated_at = NOW() WHERE id = $1", [seriesRow.id]);
  return removed;
}
