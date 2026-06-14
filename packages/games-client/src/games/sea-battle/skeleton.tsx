import { SkeletonBox } from "../../skeletons";

const CELLS = Array.from({ length: 100 }, (_, i) => i);

function GridSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <SkeletonBox className="h-4 w-28" />
      <div className="grid grid-cols-10 gap-0.5 rounded-lg border border-border bg-surface-overlay/40 p-1.5">
        {CELLS.map((id) => (
          <SkeletonBox key={id} className="aspect-square w-full rounded-sm" />
        ))}
      </div>
    </div>
  );
}

export function SeaBattleSkeleton() {
  return (
    <div className="mt-8 flex w-full flex-col gap-4">
      <SkeletonBox className="h-6 w-48" />
      <div className="flex flex-wrap gap-6">
        <GridSkeleton />
        <GridSkeleton />
      </div>
      <SkeletonBox className="h-4 w-40" />
    </div>
  );
}
