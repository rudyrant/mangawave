import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { BookmarkButton } from "@/components/reading-tracker";
import { getSeriesBySlug } from "@/lib/library";

export const dynamic = "force-dynamic";

export default async function SeriesDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const series = await getSeriesBySlug(slug);
  if (!series) notFound();
  const latestChapter = series.chapters[0];

  return (
    <SiteShell>
      <main className="shell space-y-6 py-8 sm:py-10">
        <section className="panel overflow-hidden">
          <div className="h-48 w-full sm:h-72">
            <img src={series.bannerImage} alt={series.title} className="h-full w-full object-cover" />
          </div>
          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[220px_1fr]">
            <img src={series.coverImage} alt={series.title} className="w-full rounded-[1.75rem] object-cover shadow-glow" />
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <span className="chip text-violet-200">{series.type}</span>
                <span className="chip">{series.status}</span>
                {series.genres.map((genre) => <span key={genre} className="chip">{genre}</span>)}
              </div>
              <div>
                <h1 className="text-3xl font-black text-white">{series.title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">{series.description}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-line bg-panelSoft p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Author</p>
                  <p className="mt-2 font-semibold text-white">{series.author}</p>
                </div>
                <div className="rounded-3xl border border-line bg-panelSoft p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Artist</p>
                  <p className="mt-2 font-semibold text-white">{series.artist}</p>
                </div>
                <div className="rounded-3xl border border-line bg-panelSoft p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Updated</p>
                  <p className="mt-2 font-semibold text-white">{new Date(series.updatedAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {latestChapter ? <Link href={`/read/${series.slug}/${latestChapter.slug}`} className="button-primary">Start reading</Link> : null}
                {latestChapter ? <BookmarkButton seriesSlug={series.slug} chapterSlug={latestChapter.slug} chapterLabel={`Chapter ${latestChapter.number}`} /> : null}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">Chapters</p>
            <h2 className="mt-1 text-2xl font-bold text-white">Vertical reading queue</h2>
          </div>
          <div className="grid gap-3">
            {series.chapters.map((chapter) => (
              <Link key={chapter.id} href={`/read/${series.slug}/${chapter.slug}`} className="panel flex items-center justify-between gap-4 p-4 transition hover:border-violet-400/40">
                <div>
                  <p className="text-base font-semibold text-white">Chapter {chapter.number}: {chapter.title}</p>
                  <p className="mt-1 text-xs text-muted">{new Date(chapter.publishedAt).toLocaleDateString()} • {chapter.pages.length} pages</p>
                </div>
                <span className="text-sm text-violet-300">Read →</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
