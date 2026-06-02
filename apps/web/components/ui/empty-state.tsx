import type * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-border border-dashed bg-surface-overlay/40 px-6 py-10 text-center",
        className,
      )}
    >
      <p className="font-medium text-foreground text-sm">{title}</p>
      {description ? (
        <p className="mt-1 text-muted-foreground text-sm">{description}</p>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
