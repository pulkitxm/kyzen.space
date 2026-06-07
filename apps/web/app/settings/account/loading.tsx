import { Skeleton } from "@/components/ui";

function FieldSkeleton() {
  return (
    <div>
      <Skeleton className="h-3 w-20" />
      <div className="mt-1.5 flex items-center gap-2">
        <Skeleton className="h-10 w-full max-w-xs rounded-xl" />
        <Skeleton className="h-8 w-16 rounded-xl" />
      </div>
    </div>
  );
}

export default function AccountSettingsLoading() {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="mt-1.5 h-4 w-48 max-w-full" />
      </div>

      <div className="mb-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-1 h-3 w-60 max-w-full" />
        <div className="mt-4 space-y-6">
          <FieldSkeleton />
          <FieldSkeleton />
        </div>
      </div>

      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-1 h-3 w-72 max-w-full" />
      <div className="mt-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>

      <div className="mt-6 border-border border-t pt-6">
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>
    </section>
  );
}
