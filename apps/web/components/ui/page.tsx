import type * as React from "react";
import { cn } from "@/lib/utils";

export function PageContainer({
  className,
  size = "md",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { size?: "sm" | "md" | "lg" }) {
  const max =
    size === "sm" ? "max-w-md" : size === "lg" ? "max-w-5xl" : "max-w-xl";
  return (
    <div className="min-h-full px-4 py-10">
      <div className={cn("mx-auto w-full", max, className)} {...props} />
    </div>
  );
}
