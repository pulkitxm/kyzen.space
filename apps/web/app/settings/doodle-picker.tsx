"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { FaCheck } from "react-icons/fa6";

import { usePattern } from "@/lib/appearance";
import {
  applyPattern,
  DEFAULT_PATTERN,
  PATTERNS,
  type PatternId,
} from "@/lib/patterns";
import { cn } from "@/lib/utils";

function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function previewPattern(id: PatternId) {
  applyPattern(document.documentElement, id);
}

export function DoodlePicker({ signedIn: _signedIn }: { signedIn: boolean }) {
  const mounted = useHydrated();
  const { pattern, setPattern } = usePattern();

  const committedRef = useRef<PatternId>(DEFAULT_PATTERN);
  useEffect(() => {
    committedRef.current = pattern;
  }, [pattern]);

  useEffect(() => {
    return () => previewPattern(committedRef.current);
  }, []);

  const restore = useCallback(() => previewPattern(committedRef.current), []);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover-only preview restore on a non-interactive grid of buttons; keyboard users get the same behavior via each button's onBlur
    <div
      className="grid grid-cols-2 gap-4 lg:grid-cols-3"
      onMouseLeave={restore}
    >
      {PATTERNS.map((def) => {
        const active = mounted && pattern === def.id;
        const previewTile = Math.max(56, Math.round(def.tile / 3.5));
        return (
          <button
            key={def.id}
            type="button"
            onMouseEnter={() => previewPattern(def.id)}
            onFocus={() => previewPattern(def.id)}
            onBlur={restore}
            onClick={() => setPattern(def.id)}
            aria-pressed={active}
            className={cn(
              "group relative flex flex-col gap-3 rounded-2xl border p-3 text-left outline-none transition-all duration-200",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? "border-primary ring-2 ring-primary/40"
                : "border-border hover:border-primary/50",
            )}
          >
            <div
              className="relative aspect-[3/2] w-full overflow-hidden rounded-xl border border-border shadow-inner"
              style={{ backgroundColor: "var(--background)" }}
            >
              {def.src ? (
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    backgroundColor: "var(--pattern-ink)",
                    opacity: 0.72,
                    WebkitMaskImage: `url("${def.src}")`,
                    maskImage: `url("${def.src}")`,
                    WebkitMaskRepeat: "repeat",
                    maskRepeat: "repeat",
                    WebkitMaskSize: `${previewTile}px`,
                    maskSize: `${previewTile}px`,
                  }}
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
                  No pattern
                </span>
              )}
              {active ? (
                <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                  <FaCheck className="size-3" aria-hidden />
                </span>
              ) : null}
            </div>
            <div className="px-0.5">
              <div className="font-semibold text-foreground text-sm">
                {def.name}
              </div>
              <div className="text-muted-foreground text-xs">{def.blurb}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
