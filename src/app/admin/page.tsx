import { SiteShell } from "@/components/site-shell";
import { AdminForms } from "@/components/admin-form";
import { getAllSeries } from "@/lib/library";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const series = await getAllSeries();

  return (
    <SiteShell>
      <main className="shell space-y-6 py-8 sm:py-10">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">Admin studio</p>
          <h1 className="text-3xl font-black text-white">Load your own library</h1>
          <p className="max-w-3xl text-sm leading-7 text-muted">
            This MVP keeps things simple: no forced user accounts, no cloud dependency, just create a series and upload chapter pages directly into local storage under the project&apos;s public/uploads directory.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="panel p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Storage</p>
            <p className="mt-2 text-sm text-white">Files land in <code className="rounded bg-black/30 px-2 py-1">public/uploads</code>.</p>
          </div>
          <div className="panel p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Library file</p>
            <p className="mt-2 text-sm text-white">Metadata is persisted in <code className="rounded bg-black/30 px-2 py-1">content/library.json</code>.</p>
          </div>
          <div className="panel p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Accounts</p>
            <p className="mt-2 text-sm text-white">Optional. Guest bookmarks and history are already enabled locally.</p>
          </div>
        </div>

        <AdminForms seriesOptions={series.map((item) => ({ slug: item.slug, title: item.title }))} />
      </main>
    </SiteShell>
  );
}
