import Link from "next/link";
import type { Series } from "@/lib/types";

export function SeriesCard({ series }: { series: Series }) {
  const latestChapter = [...series.chapters].sort((a, b) => b.number - a.number)[0];

  return (
    <Link href={`/series/${series.slug}`} className="group panel overflow-hidden transition hover:-translate-y-1 hover:border-violet-400/50 hover:shadow-glow">
      <div className="aspect-[3/4] overflow-hidden bg-panelSoft">
        <img src={series.coverImage} alt={series.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <span className="chip text-violet-200">{series.type}</span>
          <span className="chip">{series.status}</span>
          {series.featured ? <span className="chip border-violet-400/40 text-violet-200">Featured</span> : null}
        </div>
        <div>
          <h3 className="line-clamp-1 text-lg font-semibold text-white">{series.title}</h3>
          <p className="mt-2 line-clamp-2 text-sm text-muted">{series.shortDescription}</p>
        </div>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{series.chapters.length} chapters</span>
          <span>{latestChapter ? `Ch. ${latestChapter.number}` : "No chapters yet"}</span>
        </div>
      </div>
    </Link>
  );
}
