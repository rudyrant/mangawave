import { promises as fs } from "fs";
import path from "path";
import { cache } from "react";
import { Library, Series, Chapter } from "@/lib/types";

const contentDir = path.join(process.cwd(), "content");
const libraryFile = path.join(contentDir, "library.json");

async function ensureLibraryFile() {
  await fs.mkdir(contentDir, { recursive: true });
  try {
    await fs.access(libraryFile);
  } catch {
    await fs.writeFile(libraryFile, JSON.stringify({ series: [] }, null, 2), "utf8");
  }
}

export const getLibrary = cache(async (): Promise<Library> => {
  await ensureLibraryFile();
  const raw = await fs.readFile(libraryFile, "utf8");
  const parsed = JSON.parse(raw) as Library;
  parsed.series.sort((a, b) => Number(new Date(b.updatedAt)) - Number(new Date(a.updatedAt)));
  parsed.series.forEach((series) =>
    series.chapters.sort((a, b) => Number(b.number) - Number(a.number)),
  );
  return parsed;
});

export async function writeLibrary(library: Library) {
  await ensureLibraryFile();
  await fs.writeFile(libraryFile, JSON.stringify(library, null, 2), "utf8");
}

export async function getAllSeries() {
  const library = await getLibrary();
  return library.series;
}

export async function getSeriesBySlug(slug: string) {
  const library = await getLibrary();
  return library.series.find((series) => series.slug === slug) ?? null;
}

export async function getChapter(seriesSlug: string, chapterSlug: string): Promise<{ series: Series; chapter: Chapter } | null> {
  const series = await getSeriesBySlug(seriesSlug);
  if (!series) return null;
  const chapter = series.chapters.find((item) => item.slug === chapterSlug);
  if (!chapter) return null;
  return { series, chapter };
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

export function uniqueId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
