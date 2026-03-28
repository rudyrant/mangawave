import Link from "next/link";
import { notFound } from "next/navigation";
import { ReaderProgress } from "@/components/reading-tracker";
import { getChapter } from "@/lib/library";

export const dynamic = "force-dynamic";

export default async function ReaderPage({ params }: { params: Promise<{ seriesSlug: string; chapterSlug: string }> }) {
  const { seriesSlug, chapterSlug } = await params;
  const payload = await getChapter(seriesSlug, chapterSlug);
  if (!payload) notFound();
  const { series, chapter } = payload;
  const ordered = [...series.chapters].sort((a, b) => a.number - b.number);
  const index = ordered.findIndex((item) => item.slug === chapter.slug);
  const previous = index > 0 ? ordered[index - 1] : null;
  const next = index < ordered.length - 1 ? ordered[index + 1] : null;

  return (
    <main className="min-h-screen bg-black text-white">
      <ReaderProgress seriesSlug={series.slug} chapterSlug={chapter.slug} chapterLabel={`Chapter ${chapter.number}`} />
      <div className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <Link href={`/series/${series.slug}`} className="text-xs uppercase tracking-[0.2em] text-violet-300">← Back to series</Link>
            <h1 className="truncate text-sm font-semibold text-white sm:text-base">{series.title} • Chapter {chapter.number}</h1>
          </div>
          <div className="flex items-center gap-2">
            {previous ? <Link href={`/read/${series.slug}/${previous.slug}`} className="button-secondary px-3 py-2 text-xs">Prev</Link> : null}
            {next ? <Link href={`/read/${series.slug}/${next.slug}`} className="button-primary px-3 py-2 text-xs">Next</Link> : null}
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-0 py-4 sm:px-4">
        {chapter.pages.map((page, idx) => (
          <img key={page} src={page} alt={`${series.title} chapter ${chapter.number} page ${idx + 1}`} className="w-full bg-white/5 object-contain" />
        ))}
      </div>
    </main>
  );
}
