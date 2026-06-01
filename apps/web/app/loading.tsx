import { Skeleton } from "@/components/ui";

// Mirrors app/page.tsx: centered max-w-xl with a title block and the "Games"
// list of GameCard rows.
export default function HomeLoading() {
  return (
    <div className="flex min-h-full flex-col items-center px-4 py-14">
      <main className="w-full max-w-xl">
        <div className="flex flex-col items-center text-center">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-3 h-4 w-56" />
        </div>

        <section className="mt-10">
          <Skeleton className="h-3 w-16" />
          <ul className="mt-3 space-y-4">
            {[0, 1, 2].map((i) => (
              <GameCardSkeleton key={i} />
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

function GameCardSkeleton() {
  return (
    <li className="flex min-h-[8.5rem] overflow-hidden rounded-2xl border border-border bg-surface-raised">
      <Skeleton className="aspect-[5/6] min-h-[8.5rem] w-[44%] max-w-[11rem] shrink-0 rounded-none" />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 px-5 py-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full max-w-[16rem]" />
        <Skeleton className="mt-2 h-4 w-14" />
      </div>
    </li>
  );
}
