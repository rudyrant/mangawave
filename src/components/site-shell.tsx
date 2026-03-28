import Link from "next/link";

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur">
        <div className="shell flex items-center justify-between gap-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent font-black text-white shadow-glow">MW</div>
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-violet-300">MangaWave</p>
              <p className="text-xs text-muted">Self-hosted vertical reader</p>
            </div>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/series" className="button-secondary px-3 py-2">Library</Link>
            <Link href="/admin" className="button-primary px-3 py-2">Admin</Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
