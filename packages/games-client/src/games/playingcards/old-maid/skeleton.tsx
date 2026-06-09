import { SkeletonBox } from "../../../skeletons";

const CARDS = [0, 1, 2, 3, 4, 5, 6] as const;

export function OldMaidSkeleton() {
  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="mb-3 flex items-center gap-3">
        <SkeletonBox className="size-3 rounded-full" />
        <SkeletonBox className="h-4 w-48" />
      </div>
      <div className="old-maid-table flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-primary-dark/40">
        <SkeletonBox className="mx-4 mt-3 h-5 w-40 bg-white/25" />
        <div className="old-maid-fan old-maid-opponent-fan mt-2 w-full">
          {CARDS.map((card) => (
            <SkeletonBox
              key={card}
              className="old-maid-card-slot h-36 w-24 rounded-xl bg-white/75 sm:h-44 sm:w-28"
            />
          ))}
        </div>
        <div className="grid flex-1 grid-cols-1 gap-3 border-white/10 border-y px-3 py-3 lg:grid-cols-[1fr_2fr_1fr]">
          <SkeletonBox className="hidden h-28 rounded-lg bg-white/10 lg:block" />
          <SkeletonBox className="h-36 rounded-lg bg-white/15" />
          <SkeletonBox className="h-28 rounded-lg bg-white/10" />
        </div>
        <div className="old-maid-fan old-maid-player-fan w-full">
          {CARDS.map((card) => (
            <SkeletonBox
              key={card}
              className="old-maid-card-slot h-44 w-32 rounded-xl bg-white/75 sm:h-52 sm:w-36"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
