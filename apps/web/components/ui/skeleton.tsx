import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-foreground/30 dark:bg-surface-overlay",
        className,
      )}
      {...props}
    />
  );
}
