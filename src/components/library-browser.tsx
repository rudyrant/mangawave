"use client";

import { useMemo, useState } from "react";
import { SeriesCard } from "@/components/series-card";
import type { Series } from "@/lib/types";

export function LibraryBrowser({ seriesList }: { seriesList: Series[] }) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("All");
  const genres = useMemo(() => ["All", ...new Set(seriesList.flatMap((series) => series.genres))], [seriesList]);

  const filtered = useMemo(() => {
    return seriesList.filter((series) => {
      const haystack = `${series.title} ${series.shortDescription} ${series.tags.join(" ")} ${series.genres.join(" ")}`.toLowerCase();
      const matchesQuery = haystack.includes(query.toLowerCase());
      const matchesGenre = genre === "All" || series.genres.includes(genre);
      return matchesQuery && matchesGenre;
    });
  }, [genre, query, seriesList]);

  return (
    <div className="space-y-6">
      <div className="panel p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles, genres, or vibes"
            className="w-full rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm outline-none ring-0 transition placeholder:text-muted focus:border-violet-400"
          />
          <select
            value={genre}
            onChange={(event) => setGenre(event.target.value)}
            className="w-full rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm outline-none transition focus:border-violet-400"
          >
            {genres.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {filtered.map((series) => (
          <SeriesCard key={series.id} series={series} />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-muted">No series matched that search. Add one from the admin page or loosen the filter.</div>
      ) : null}
    </div>
  );
}
