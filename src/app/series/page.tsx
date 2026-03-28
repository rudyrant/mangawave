import { SiteShell } from "@/components/site-shell";
import { LibraryBrowser } from "@/components/library-browser";
import { getAllSeries } from "@/lib/library";

export const dynamic = "force-dynamic";

export default async function SeriesPage() {
  const series = await getAllSeries();

  return (
    <SiteShell>
      <main className="shell space-y-6 py-8 sm:py-10">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">Library</p>
          <h1 className="text-3xl font-black text-white">Browse your catalog</h1>
          <p className="max-w-2xl text-sm leading-7 text-muted">Search by title, mood, tag, or genre. This screen is built for phone readers first, then stretches cleanly to desktop.</p>
        </div>
        <LibraryBrowser seriesList={series} />
      </main>
    </SiteShell>
  );
}
