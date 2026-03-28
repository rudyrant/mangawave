"use client";

import { useActionState, useEffect, useRef } from "react";
import { createChapterAction, createSeriesAction } from "@/app/admin/actions";

type State = { error: string | null; success: string | null };
const initialState: State = { error: null, success: null };

async function seriesActionHandler(_: State, formData: FormData): Promise<State> {
  try {
    await createSeriesAction(formData);
    return { error: null, success: "Series created." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create series.", success: null };
  }
}

async function chapterActionHandler(_: State, formData: FormData): Promise<State> {
  try {
    await createChapterAction(formData);
    return { error: null, success: "Chapter uploaded." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create chapter.", success: null };
  }
}

function FormFeedback({ state }: { state: State }) {
  if (!state.error && !state.success) return null;
  return (
    <div className={state.error ? "rounded-2xl border border-rose-400/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-100" : "rounded-2xl border border-emerald-400/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-100"}>
      {state.error ?? state.success}
    </div>
  );
}

export function AdminForms({ seriesOptions }: { seriesOptions: { slug: string; title: string }[] }) {
  const [seriesState, seriesFormAction, seriesPending] = useActionState(seriesActionHandler, initialState);
  const [chapterState, chapterFormAction, chapterPending] = useActionState(chapterActionHandler, initialState);
  const seriesRef = useRef<HTMLFormElement>(null);
  const chapterRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (seriesState.success) seriesRef.current?.reset();
  }, [seriesState.success]);

  useEffect(() => {
    if (chapterState.success) chapterRef.current?.reset();
  }, [chapterState.success]);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form ref={seriesRef} action={seriesFormAction} className="panel space-y-4 p-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">New series</p>
          <h2 className="mt-1 text-2xl font-bold text-white">Create a library entry</h2>
        </div>
        <FormFeedback state={seriesState} />
        <div className="grid gap-4">
          <input name="title" placeholder="Series title" required className="rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm" />
          <textarea name="shortDescription" placeholder="One-line hook" required className="min-h-24 rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm" />
          <textarea name="description" placeholder="Full description" required className="min-h-36 rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm" />
          <div className="grid gap-4 sm:grid-cols-2">
            <input name="author" placeholder="Author" className="rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm" />
            <input name="artist" placeholder="Artist" className="rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <select name="type" className="rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm">
              <option>Manhwa</option>
              <option>Manga</option>
              <option>Manhua</option>
            </select>
            <select name="status" className="rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm">
              <option>Ongoing</option>
              <option>Completed</option>
              <option>Hiatus</option>
            </select>
          </div>
          <input name="genres" placeholder="Genres, comma separated" className="rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm" />
          <input name="tags" placeholder="Tags, comma separated" className="rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm" />
          <label className="grid gap-2 text-sm text-muted">
            <span>Cover image</span>
            <input type="file" name="cover" accept="image/*" className="rounded-2xl border border-dashed border-line bg-panelSoft px-4 py-3 text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-violet-500 file:px-3 file:py-2 file:text-white" />
          </label>
          <label className="grid gap-2 text-sm text-muted">
            <span>Banner image</span>
            <input type="file" name="banner" accept="image/*" className="rounded-2xl border border-dashed border-line bg-panelSoft px-4 py-3 text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-violet-500 file:px-3 file:py-2 file:text-white" />
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm text-muted"><input type="checkbox" name="featured" className="h-4 w-4" /> Featured on homepage</label>
          <label className="flex items-center gap-3 rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm text-muted"><input type="checkbox" name="mature" className="h-4 w-4" /> Mature content</label>
        </div>
        <button disabled={seriesPending} className="button-primary w-full disabled:opacity-50">{seriesPending ? "Creating..." : "Create series"}</button>
      </form>

      <form ref={chapterRef} action={chapterFormAction} className="panel space-y-4 p-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">New chapter</p>
          <h2 className="mt-1 text-2xl font-bold text-white">Upload vertical pages</h2>
        </div>
        <FormFeedback state={chapterState} />
        <div className="grid gap-4">
          <select name="seriesSlug" required className="rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm">
            <option value="">Choose a series</option>
            {seriesOptions.map((series) => <option key={series.slug} value={series.slug}>{series.title}</option>)}
          </select>
          <input name="title" placeholder="Chapter title" required className="rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm" />
          <div className="grid gap-4 sm:grid-cols-2">
            <input name="number" type="number" step="1" min="1" placeholder="Chapter number" required className="rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm" />
            <input name="estimatedMinutes" type="number" step="1" min="1" placeholder="Estimated reading time" className="rounded-2xl border border-line bg-panelSoft px-4 py-3 text-sm" />
          </div>
          <label className="grid gap-2 text-sm text-muted">
            <span>Page images in reading order</span>
            <input type="file" name="pages" accept="image/*" multiple required className="rounded-2xl border border-dashed border-line bg-panelSoft px-4 py-3 text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-violet-500 file:px-3 file:py-2 file:text-white" />
          </label>
        </div>
        <button disabled={chapterPending} className="button-primary w-full disabled:opacity-50">{chapterPending ? "Uploading..." : "Upload chapter"}</button>
      </form>
    </div>
  );
}
