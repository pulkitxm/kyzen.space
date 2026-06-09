import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <output
      aria-label="Loading"
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}
