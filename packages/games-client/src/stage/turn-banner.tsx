"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";

export type TurnBannerTone = "self" | "waiting" | "result" | "danger";

const TONE_CLASS: Record<TurnBannerTone, string> = {
  self: "font-medium text-primary",
  waiting: "text-muted-foreground",
  result: "font-medium text-primary",
  danger: "text-danger",
};

export function TurnBanner({
  label,
  tone = "waiting",
}: {
  label: string | null;
  tone?: TurnBannerTone;
}) {
  const reduce = useReducedMotion();

  return (
    <div className="flex h-6 items-center" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        {label ? (
          <m.p
            key={label}
            className={`text-sm ${TONE_CLASS[tone]}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -5 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            {label}
          </m.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
