import { promises as fs } from "fs";
import path from "path";
import { writeLibrary, getLibrary, slugify, uniqueId } from "@/lib/library";
import type { Chapter, Series } from "@/lib/types";

async function saveUploadedFile(file: File, folder: string) {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const uploadDir = path.join(process.cwd(), "public", "uploads", folder);
  await fs.mkdir(uploadDir, { recursive: true });
  const safeName = `${Date.now()}-${slugify(file.name.replace(/\.[^.]+$/, ""))}${path.extname(file.name) || ".png"}`;
  const fullPath = path.join(uploadDir, safeName);
  await fs.writeFile(fullPath, buffer);
  return `/uploads/${folder}/${safeName}`;
}

export async function createSeriesFromFormData(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const shortDescription = String(formData.get("shortDescription") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const author = String(formData.get("author") ?? "").trim();
  const artist = String(formData.get("artist") ?? "").trim();
  const type = String(formData.get("type") ?? "Manhwa") as Series["type"];
  const status = String(formData.get("status") ?? "Ongoing") as Series["status"];
  const featured = String(formData.get("featured") ?? "") === "on";
  const mature = String(formData.get("mature") ?? "") === "on";
  const tags = String(formData.get("tags") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const genres = String(formData.get("genres") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const coverFile = formData.get("cover") as File | null;
  const bannerFile = formData.get("banner") as File | null;

  if (!title || !shortDescription || !description) {
    throw new Error("Title, short description, and full description are required.");
  }

  const library = await getLibrary();
  const slug = slugify(title);
  if (library.series.some((item) => item.slug === slug)) {
    throw new Error("A series with this title already exists.");
  }

  const coverImage = coverFile && coverFile.size > 0 ? await saveUploadedFile(coverFile, `covers/${slug}`) : "/generated/default-cover.svg";
  const bannerImage = bannerFile && bannerFile.size > 0 ? await saveUploadedFile(bannerFile, `banners/${slug}`) : "/generated/default-banner.svg";

  const series: Series = {
    id: uniqueId("series"),
    slug,
    title,
    shortDescription,
    description,
    coverImage,
    bannerImage,
    author: author || "Unknown",
    artist: artist || author || "Unknown",
    status,
    type,
    featured,
    mature,
    updatedAt: new Date().toISOString(),
    tags,
    genres,
    chapters: [],
  };

  library.series.unshift(series);
  await writeLibrary(library);
  return series;
}

export async function createChapterFromFormData(formData: FormData) {
  const seriesSlug = String(formData.get("seriesSlug") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const chapterNumber = Number(formData.get("number") ?? 0);
  const estimatedMinutes = Number(formData.get("estimatedMinutes") ?? 0) || undefined;
  const pageFiles = formData.getAll("pages") as File[];

  if (!seriesSlug || !title || !chapterNumber || pageFiles.length === 0) {
    throw new Error("Series, chapter title, chapter number, and at least one page image are required.");
  }

  const library = await getLibrary();
  const series = library.series.find((item) => item.slug === seriesSlug);
  if (!series) {
    throw new Error("Series not found.");
  }

  const slug = `chapter-${String(chapterNumber).replace(/\.0+$/, "")}`;
  if (series.chapters.some((item) => item.slug === slug)) {
    throw new Error("That chapter number already exists for this series.");
  }

  const pages: string[] = [];
  for (const file of pageFiles) {
    if (file.size === 0) continue;
    pages.push(await saveUploadedFile(file, `chapters/${series.slug}/${slug}`));
  }

  const chapter: Chapter = {
    id: uniqueId("chapter"),
    title,
    slug,
    number: chapterNumber,
    publishedAt: new Date().toISOString(),
    pages,
    estimatedMinutes,
  };

  series.chapters.unshift(chapter);
  series.updatedAt = new Date().toISOString();
  await writeLibrary(library);
  return chapter;
}
