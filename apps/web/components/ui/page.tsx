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

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-semibold text-2xl text-foreground tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
