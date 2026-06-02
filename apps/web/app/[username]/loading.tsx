import { Skeleton } from "@/components/ui";

export default function ProfileLoading() {
  return (
    <div className="min-h-full bg-surface text-card-foreground">
      <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-8">
        <Skeleton className="h-4 w-20" />

        <header className="mt-8">
          <Skeleton className="h-[9.5rem] w-full rounded-2xl sm:h-[12rem]" />
          <div className="relative z-10 mx-3 -mt-9 flex flex-col gap-6 rounded-2xl border border-border bg-card/95 p-4 shadow-xl shadow-black/5 backdrop-blur sm:mx-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-5">
              <Skeleton className="size-[5.75rem] shrink-0 rounded-2xl sm:size-24" />
              <div className="min-w-0 space-y-2 pb-1 sm:pb-2">
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:mb-2">
              <Skeleton className="h-10 w-24 rounded-full" />
              <Skeleton className="size-11 rounded-full" />
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[300px,minmax(0,1fr)] lg:gap-10">
          <aside className="flex flex-col gap-5">
            <ProfileCardSkeleton rows={2} />
            <ProfileCardSkeleton rows={2} thumbs />
          </aside>
          <main />
        </div>
      </div>
    </div>
  );
}

function ProfileCardSkeleton({
  rows,
  thumbs,
}: {
  rows: number;
  thumbs?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <Skeleton className="h-3 w-16" />
      <ul className="mt-4 space-y-4">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex gap-3">
            <Skeleton
              className={thumbs ? "size-14 rounded-xl" : "size-9 rounded-lg"}
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
