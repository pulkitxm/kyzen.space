import type { ComponentProps } from "react";

export function SkeletonBox({
  className = "",
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-md bg-foreground/30 dark:bg-surface-overlay ${className}`}
      {...props}
    />
  );
}

export function DefaultGameSkeleton() {
  return (
    <div className="mt-8 flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <SkeletonBox className="h-6 w-40" />
        <SkeletonBox className="h-6 w-24" />
      </div>
      <SkeletonBox className="aspect-square w-full rounded-2xl" />
      <SkeletonBox className="h-4 w-48" />
    </div>
  );
}
