/**
 * Placeholder for a dashboard section while its server component streams in.
 *
 * The client dashboard layout is `force-dynamic`, so every section change waits
 * on a server round trip. Without a loading state the router holds the old
 * screen and then swaps the whole thing at once, which reads as a page reload.
 * Rendering this instead keeps the sidebar and header mounted and swaps only
 * the section body.
 */
export function DashboardSectionSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse px-5 py-6 sm:px-7 lg:px-9 lg:py-8" aria-hidden="true">
      <div className="h-7 w-52 rounded-lg bg-brand-stroke/30" />
      <div className="mt-3 h-4 w-80 max-w-full rounded-md bg-brand-stroke/20" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((tile) => (
          <div key={tile} className="h-32 rounded-2xl border border-brand-stroke/20 bg-brand-stroke/10" />
        ))}
      </div>
      <div className="mt-6 h-64 rounded-2xl border border-brand-stroke/20 bg-brand-stroke/10" />
      <span className="sr-only">Loading this section</span>
    </div>
  );
}
