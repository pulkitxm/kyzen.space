"use client";

import type { CSSProperties } from "react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useSyncExternalStore,
} from "react";
import { FaCheck } from "react-icons/fa6";

import { useGlassMode } from "@/lib/appearance";
import {
  applyGlass,
  DEFAULT_GLASS_MODE,
  GLASS_MODE_DEFS,
  type GlassMode,
} from "@/lib/glass";
import { cn } from "@/lib/utils";

function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function previewGlass(id: GlassMode) {
  applyGlass(document.documentElement, id);
}

const CHIP_BASE: CSSProperties = {
  backdropFilter: "blur(6px) saturate(170%)",
  WebkitBackdropFilter: "blur(6px) saturate(170%)",
  boxShadow:
    "inset 1.5px 1.5px 1px -1px rgba(255,255,255,0.85), inset -1.5px -1.5px 1px -1px rgba(255,255,255,0.5), 0 6px 16px rgba(0,0,0,0.25)",
};

const CHIP_STYLES: Record<GlassMode, CSSProperties> = {
  off: {
    background: "var(--card)",
    boxShadow: "0 6px 16px rgba(0,0,0,0.18)",
  },
  neutral: {
    ...CHIP_BASE,
    background: "color-mix(in srgb, #ffffff 30%, transparent)",
  },
  tinted: {
    ...CHIP_BASE,
    background:
      "color-mix(in srgb, var(--v) 30%, color-mix(in srgb, #ffffff 25%, transparent))",
  },
  smoke: {
    ...CHIP_BASE,
    background: "color-mix(in srgb, #0a0c18 50%, transparent)",
    boxShadow:
      "inset 1.5px 1.5px 1px -1px rgba(255,255,255,0.4), inset -1.5px -1.5px 1px -1px rgba(255,255,255,0.18), 0 6px 16px rgba(0,0,0,0.35)",
  },
};

export function GlassPicker() {
  const mounted = useHydrated();
  const { glass, setGlass } = useGlassMode();

  const committedRef = useRef<GlassMode>(DEFAULT_GLASS_MODE);
  useEffect(() => {
    committedRef.current = glass;
  }, [glass]);

  const restoreCommitted = useEffectEvent(() =>
    previewGlass(committedRef.current),
  );

  useEffect(() => {
    return () => restoreCommitted();
  }, []);

  const restore = useCallback(() => previewGlass(committedRef.current), []);

  return (
    <div>
      <h3 className="mb-3 font-medium text-foreground text-sm">Liquid Glass</h3>
      <p className="mb-3 text-muted-foreground text-sm">
        Turns the app's surfaces into liquid glass: panes refract what's behind
        them, catch the light along their edges, and compress when pressed.
        Refraction needs a Chromium browser; everywhere else you still get the
        full glass material.
      </p>
      {/** biome-ignore lint/a11y/noStaticElementInteractions: hover-only preview restore on a non-interactive grid of buttons; keyboard users get the same behavior via each button's onBlur */}
      <div
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        onMouseLeave={restore}
      >
        {GLASS_MODE_DEFS.map((def) => {
          const active = mounted && glass === def.id;
          return (
            <button
              key={def.id}
              type="button"
              onMouseEnter={() => previewGlass(def.id)}
              onFocus={() => previewGlass(def.id)}
              onBlur={restore}
              onClick={() => setGlass(def.id)}
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
                className="relative h-28 w-full overflow-hidden rounded-xl shadow-inner"
                style={{
                  background:
                    "linear-gradient(120deg, var(--d) 0%, color-mix(in srgb, var(--d) 40%, var(--v)) 55%, var(--v) 100%)",
                }}
              >
                <span
                  aria-hidden
                  className="absolute top-3 left-3 size-6 rounded-full"
                  style={{
                    background: "color-mix(in srgb, var(--v) 70%, #ffffff)",
                  }}
                />
                <span
                  aria-hidden
                  className="absolute bottom-3 left-5 h-2 w-16 rounded-full"
                  style={{
                    background: "color-mix(in srgb, #ffffff 35%, transparent)",
                  }}
                />
                <span
                  aria-hidden
                  className="absolute inset-x-6 top-7 h-14 rounded-2xl"
                  style={CHIP_STYLES[def.id]}
                />
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
    </div>
  );
}
