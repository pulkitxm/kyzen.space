import { SkeletonBox } from "../../skeletons";

const CELLS = ["nw", "n", "ne", "w", "c", "e", "sw", "s", "se"] as const;

export function TicTacToeSkeleton() {
  return (
    <div className="mt-8">
      <div className="mb-5 flex items-stretch gap-3">
        <SkeletonBox className="h-14 flex-1 rounded-xl" />
        <SkeletonBox className="h-14 flex-1 rounded-xl" />
      </div>
      <div className="mb-4 flex items-center justify-between">
        <SkeletonBox className="h-5 w-28" />
        <SkeletonBox className="size-3 rounded-full" />
      </div>
      <div className="grid w-fit grid-cols-3 gap-3">
        {CELLS.map((id) => (
          <SkeletonBox key={id} className="size-24 rounded-xl sm:size-28" />
        ))}
      </div>
      <SkeletonBox className="mt-6 h-4 w-32" />
    </div>
  );
}
