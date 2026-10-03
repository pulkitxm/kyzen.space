import { SkeletonBox } from "../../skeletons";

const SLOTS = ["missile", "jump", "shield", "special-a", "special-b"] as const;

export function TankArenaSkeleton() {
  return (
    <div
      aria-hidden
      className="relative flex min-h-105 w-full flex-1 flex-col overflow-hidden rounded-2xl bg-slate-950/40"
    >
      <div className="flex items-center gap-3 p-3">
        <SkeletonBox className="size-11 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <SkeletonBox className="h-4 w-28" />
          <SkeletonBox className="h-3 w-20" />
        </div>
      </div>
      <div className="flex flex-1 items-end gap-3 px-6 pb-28">
        <SkeletonBox className="h-6 w-1/3" />
        <SkeletonBox className="mb-10 h-4 w-1/5" />
        <SkeletonBox className="h-6 w-1/3" />
      </div>
      <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
        <div className="grid grid-cols-5 gap-1.5">
          {SLOTS.map((slot) => (
            <SkeletonBox key={slot} className="size-14 rounded-lg" />
          ))}
        </div>
        <SkeletonBox className="h-14 w-32 rounded-xl" />
      </div>
    </div>
  );
}
