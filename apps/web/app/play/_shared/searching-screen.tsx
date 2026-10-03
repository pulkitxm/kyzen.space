"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";

export function SearchingScreen({
  title,
  subtitle,
  icon,
  spinning = true,
  onCancel,
  cancelLabel = "Cancel",
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  spinning?: boolean;
  onCancel?: () => void;
  cancelLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="relative flex size-28 items-center justify-center">
        {spinning ? (
          <>
            <m.span
              className="absolute inset-0 rounded-full border-4 border-primary/20"
              animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.2, 0.6] }}
              transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY }}
            />
            <m.span
              className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary"
              animate={{ rotate: 360 }}
              transition={{
                duration: 1.1,
                repeat: Number.POSITIVE_INFINITY,
                ease: "linear",
              }}
            />
          </>
        ) : null}
        <span className="text-3xl text-primary">{icon}</span>
      </div>

      <div className="space-y-1">
        <p className="font-semibold text-foreground text-lg">{title}</p>
        {subtitle ? (
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        ) : null}
      </div>

      {children}

      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-border px-5 py-2 font-medium text-card-foreground text-sm outline-none transition hover:bg-surface-overlay"
        >
          {cancelLabel}
        </button>
      ) : null}
    </div>
  );
}
