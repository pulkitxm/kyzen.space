"use client";

import { m } from "motion/react";
import type { ComponentPropsWithoutRef, Ref } from "react";
import { useCallback } from "react";
import { useLiquidLens } from "@/components/glass/liquid-glass";
import { cn } from "@/lib/utils";

export function useGlassPaneRef<T extends HTMLElement>(
  ref?: Ref<T>,
): (node: T | null) => void {
  const lensRef = useLiquidLens<T>();
  return useCallback(
    (node: T | null) => {
      lensRef(node);
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [lensRef, ref],
  );
}

export function GlassPane({
  className,
  ref,
  ...props
}: ComponentPropsWithoutRef<"div"> & { ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={useGlassPaneRef(ref)}
      className={cn("glass-pane", className)}
      {...props}
    />
  );
}

export function GlassMotionPane({
  className,
  ref,
  ...props
}: ComponentPropsWithoutRef<typeof m.div> & { ref?: Ref<HTMLDivElement> }) {
  return (
    <m.div
      ref={useGlassPaneRef(ref)}
      className={cn("glass-pane", className)}
      {...props}
    />
  );
}
