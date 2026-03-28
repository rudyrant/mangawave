"use client";

import { useEffect, useMemo, useState } from "react";

const historyKey = "mangawave-reading-history";
const bookmarksKey = "mangawave-bookmarks";

type Entry = {
  seriesSlug: string;
  chapterSlug: string;
  chapterLabel: string;
  updatedAt: string;
};

export function useStoredEntries(key: string) {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      setEntries(JSON.parse(raw));
    } catch {
      localStorage.removeItem(key);
    }
  }, [key]);

  const save = (next: Entry[]) => {
    setEntries(next);
    localStorage.setItem(key, JSON.stringify(next));
  };

  return { entries, save };
}

export function BookmarkButton({ seriesSlug, chapterSlug, chapterLabel }: { seriesSlug: string; chapterSlug: string; chapterLabel: string }) {
  const { entries, save } = useStoredEntries(bookmarksKey);
  const exists = useMemo(() => entries.some((entry) => entry.seriesSlug === seriesSlug), [entries, seriesSlug]);

  return (
    <button
      className={exists ? "button-primary" : "button-secondary"}
      onClick={() => {
        if (exists) {
          save(entries.filter((entry) => entry.seriesSlug !== seriesSlug));
        } else {
          save([{ seriesSlug, chapterSlug, chapterLabel, updatedAt: new Date().toISOString() }, ...entries.filter((entry) => entry.seriesSlug !== seriesSlug)]);
        }
      }}
    >
      {exists ? "Bookmarked" : "Bookmark series"}
    </button>
  );
}

export function ReadingHistory({ items }: { items: { seriesSlug: string; title: string; coverImage: string; latestChapterLabel: string }[] }) {
  const { entries } = useStoredEntries(historyKey);

  if (entries.length === 0) {
    return <div className="panel p-6 text-sm text-muted">Your local reading history will appear here after you open a chapter.</div>;
  }

  return (
    <div className="grid gap-3">
      {entries.map((entry) => {
        const meta = items.find((item) => item.seriesSlug === entry.seriesSlug);
        if (!meta) return null;
        return (
          <a key={entry.seriesSlug} href={`/read/${entry.seriesSlug}/${entry.chapterSlug}`} className="panel flex items-center gap-4 p-3 transition hover:border-violet-400/40">
            <img src={meta.coverImage} alt={meta.title} className="h-20 w-16 rounded-2xl object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{meta.title}</p>
              <p className="truncate text-xs text-muted">Resume {entry.chapterLabel}</p>
              <p className="mt-1 text-xs text-muted">Latest available: {meta.latestChapterLabel}</p>
            </div>
          </a>
        );
      })}
    </div>
  );
}

export function ReaderProgress({ seriesSlug, chapterSlug, chapterLabel }: { seriesSlug: string; chapterSlug: string; chapterLabel: string }) {
  useEffect(() => {
    const raw = localStorage.getItem(historyKey);
    let entries: Entry[] = [];
    if (raw) {
      try {
        entries = JSON.parse(raw);
      } catch {
        entries = [];
      }
    }

    const next = [
      { seriesSlug, chapterSlug, chapterLabel, updatedAt: new Date().toISOString() },
      ...entries.filter((entry) => entry.seriesSlug !== seriesSlug),
    ].slice(0, 12);

    localStorage.setItem(historyKey, JSON.stringify(next));
  }, [chapterLabel, chapterSlug, seriesSlug]);

  return null;
}
