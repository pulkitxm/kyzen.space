import { SkeletonBox } from "../../skeletons";

const CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

export function TicTacToeSkeleton() {
  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center">
        <SkeletonBox className="size-3 rounded-full" />
      </div>
      <div className="grid w-fit grid-cols-3 gap-3">
        {CELLS.map((i) => (
          <SkeletonBox key={i} className="size-24 rounded-xl sm:size-28" />
        ))}
      </div>
      <SkeletonBox className="mt-6 h-4 w-32" />
    </div>
  );
}
