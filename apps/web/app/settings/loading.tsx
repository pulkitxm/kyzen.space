import { Skeleton } from "@/components/ui";

export default function SettingsLoading() {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-1.5 h-4 w-64 max-w-full" />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-xs rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    </section>
  );
}
