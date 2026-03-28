import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { SeriesCard } from "@/components/series-card";
import { ReadingHistory } from "@/components/reading-tracker";
import { getAllSeries } from "@/lib/library";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const series = await getAllSeries();
  const featured = series.filter((item) => item.featured).slice(0, 4);
  const latest = series.slice(0, 8);
  const historyItems = series.map((item) => ({
    seriesSlug: item.slug,
    title: item.title,
    coverImage: item.coverImage,
    latestChapterLabel: item.chapters[0] ? `Chapter ${item.chapters[0].number}` : "No chapters yet",
  }));

  return (
    <SiteShell>
      <main className="shell space-y-8 py-8 sm:py-10">
        <section className="panel overflow-hidden">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
            <div className="space-y-5">
              <span className="chip border-violet-400/40 text-violet-200">Mobile-first • vertical reader • self-hosted</span>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl">Run your own manga and manhwa platform without fighting the stack.</h1>
                <p className="max-w-2xl text-sm leading-7 text-muted sm:text-base">
                  MangaWave ships with a clean library, vertical chapter reader, local bookmarks, and an admin upload flow. Start with demo content, then replace it with your own scans and covers.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/series" className="button-primary">Browse library</Link>
                <Link href="/admin" className="button-secondary">Upload a new series</Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-line bg-panelSoft p-4">
                  <p className="text-2xl font-black text-white">{series.length}</p>
                  <p className="text-xs text-muted">Series in library</p>
                </div>
                <div className="rounded-3xl border border-line bg-panelSoft p-4">
                  <p className="text-2xl font-black text-white">{series.reduce((sum, item) => sum + item.chapters.length, 0)}</p>
                  <p className="text-xs text-muted">Chapters available</p>
                </div>
                <div className="rounded-3xl border border-line bg-panelSoft p-4">
                  <p className="text-2xl font-black text-white">Guest</p>
                  <p className="text-xs text-muted">Accounts optional by default</p>
                </div>
              </div>
            </div>
            <div className="panel border-violet-400/20 bg-panelSoft p-4">
              <img src={series[0]?.bannerImage ?? "/generated/default-banner.svg"} alt="Featured artwork" className="h-full w-full rounded-[1.5rem] object-cover" />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">Continue reading</p>
              <h2 className="mt-1 text-2xl font-bold text-white">Saved on this device</h2>
            </div>
          </div>
          <ReadingHistory items={historyItems} />
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">Featured series</p>
              <h2 className="mt-1 text-2xl font-bold text-white">Front page spotlight</h2>
            </div>
            <Link href="/series" className="text-sm text-violet-300">View all →</Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {featured.map((item) => <SeriesCard key={item.id} series={item} />)}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">Latest updates</p>
            <h2 className="mt-1 text-2xl font-bold text-white">Fresh chapters and recently updated entries</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {latest.map((item) => <SeriesCard key={item.id} series={item} />)}
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
