import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  info: "border-border bg-surface-overlay/60 text-foreground",
  success: "border-success-border bg-success-bg text-success-label-text",
  warning: "border-warning/40 bg-warning/10 text-warning-foreground",
  danger: "border-danger/40 bg-danger/10 text-danger",
};

export function Alert({
  tone = "info",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
