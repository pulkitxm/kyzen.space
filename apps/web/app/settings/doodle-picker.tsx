"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { FaCheck } from "react-icons/fa";

import { usePattern } from "@/lib/appearance";
import { DEFAULT_PATTERN, PATTERNS, type PatternId } from "@/lib/patterns";
import { cn } from "@/lib/utils";

function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** Set <html data-pattern> directly for a non-persisted live preview. */
function previewPattern(id: PatternId) {
  document.documentElement.setAttribute("data-pattern", id);
}

export function DoodlePicker({ signedIn }: { signedIn: boolean }) {
  const mounted = useHydrated();
  const { pattern, setPattern } = usePattern();

  // Keep the committed pattern in a ref so hover-out / unmount can restore it.
  const committedRef = useRef<PatternId>(DEFAULT_PATTERN);
  useEffect(() => {
    committedRef.current = pattern;
  }, [pattern]);

  useEffect(() => {
    return () => previewPattern(committedRef.current);
  }, []);

  const restore = useCallback(() => previewPattern(committedRef.current), []);

  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-4"
      onMouseLeave={restore}
    >
      {PATTERNS.map((def) => {
        const active = mounted && pattern === def.id;
        // Scale the tile down so the preview card shows a few repeats.
        const previewTile = Math.max(48, Math.round(def.tile / 4));
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
              className="relative h-24 w-full overflow-hidden rounded-xl border border-border shadow-inner"
              style={{ backgroundColor: "var(--background)" }}
            >
              {def.src ? (
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    backgroundColor: "var(--pattern-ink)",
                    opacity: 0.55,
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
