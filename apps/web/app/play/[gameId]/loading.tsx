import { Skeleton } from "@/components/ui";

// Mirrors app/play/[gameId]/play-client.tsx: the game board (centered max-w-2xl
// column) alongside the chat column. The real split is resizable; this is a
// static approximation that fills the same space without layout shift.
export default function PlayLoading() {
  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-6 w-24" />
          </div>
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>

      <div className="hidden w-[360px] shrink-0 flex-col border-border border-l md:flex">
        <div className="flex items-center gap-3 border-border border-b px-4 py-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {[
            { mine: false, w: "70%" },
            { mine: true, w: "45%" },
            { mine: false, w: "55%" },
            { mine: true, w: "40%" },
          ].map((b, i) => (
            <div
              key={i}
              className={b.mine ? "flex justify-end" : "flex justify-start"}
            >
              <Skeleton
                className="h-9 rounded-2xl"
                style={{ width: b.w, maxWidth: "80%" }}
              />
            </div>
          ))}
        </div>
        <div className="border-border border-t p-3">
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
