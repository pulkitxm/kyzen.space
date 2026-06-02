import { Skeleton } from "@/components/ui";

export default function SettingsLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-64 max-w-full" />
      </header>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-1 h-4 w-80 max-w-full" />
        </div>

        <div className="flex flex-col gap-6">
          <div className="inline-flex w-fit gap-1 rounded-xl border border-border bg-surface p-1">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
