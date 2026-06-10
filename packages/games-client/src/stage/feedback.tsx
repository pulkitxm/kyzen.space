"use client";

import { m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function PiecePop({
  children,
  animate = true,
  className = "inline-flex",
}: {
  children: ReactNode;
  animate?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const skip = !animate || reduce;

  return (
    <m.span
      className={className}
      initial={skip ? false : { scale: 0.55, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={
        skip ? { duration: 0 } : { type: "spring", duration: 0.35, bounce: 0.4 }
      }
    >
      {children}
    </m.span>
  );
}
