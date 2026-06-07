import { SkeletonBox } from "../../../skeletons";

const CARDS = [0, 1, 2, 3, 4, 5] as const;

export function OldMaidSkeleton() {
  return (
    <div className="mt-8 max-w-5xl">
      <div className="mb-4 flex items-center gap-3">
        <SkeletonBox className="size-3 rounded-full" />
        <SkeletonBox className="h-4 w-40" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div>
          <SkeletonBox className="mb-3 h-5 w-44" />
          <div className="flex min-h-32 flex-wrap gap-3">
            {CARDS.map((card) => (
              <SkeletonBox key={card} className="h-28 w-20 rounded-lg" />
            ))}
          </div>
          <SkeletonBox className="mt-8 mb-3 h-5 w-32" />
          <div className="flex min-h-32 flex-wrap gap-3">
            {CARDS.map((card) => (
              <SkeletonBox key={card} className="h-28 w-20 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <SkeletonBox className="h-5 w-24" />
          <SkeletonBox className="mt-3 h-4 w-32" />
          <SkeletonBox className="mt-6 h-32 w-full" />
        </div>
      </div>
    </div>
  );
}
