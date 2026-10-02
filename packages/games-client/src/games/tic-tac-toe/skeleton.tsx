import { SkeletonBox } from "../../skeletons";

const CELLS = ["nw", "n", "ne", "w", "c", "e", "sw", "s", "se"] as const;

function RailSkeleton() {
  return (
    <div className="@5xl:flex hidden flex-col gap-4">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface-raised px-4 py-5">
        <SkeletonBox className="size-20 rounded-full" />
        <SkeletonBox className="h-4 w-24" />
        <SkeletonBox className="h-6 w-full rounded-lg" />
      </div>
      <SkeletonBox className="h-12 w-full rounded-xl" />
    </div>
  );
}

export function TicTacToeSkeleton() {
  return (
    <div className="@container w-full pt-2">
      <div className="grid @5xl:grid-cols-[17rem_minmax(0,1fr)_18rem] @5xl:gap-6 gap-5">
        <RailSkeleton />
        <div className="flex flex-col items-center gap-5">
          <SkeletonBox className="h-9 w-40 rounded-full" />
          <div className="grid grid-cols-3 gap-3 rounded-[1.75rem] border border-border bg-surface-overlay/40 p-3">
            {CELLS.map((id) => (
              <SkeletonBox
                key={id}
                className="size-24 rounded-2xl sm:size-28"
              />
            ))}
          </div>
        </div>
        <RailSkeleton />
      </div>
    </div>
  );
}
