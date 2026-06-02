"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { FaCheck, FaDesktop, FaMoon, FaSun } from "react-icons/fa";

import { useColorModeSetting, usePalette } from "@/lib/appearance";
import {
  type ColorMode,
  DEFAULT_THEME,
  THEMES,
  type ThemeId,
} from "@/lib/themes";
import { cn } from "@/lib/utils";

function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function previewPalette(id: ThemeId) {
  document.documentElement.setAttribute("data-theme", id);
}

const MODE_OPTIONS: { id: ColorMode; label: string; Icon: typeof FaSun }[] = [
  { id: "light", label: "Light", Icon: FaSun },
  { id: "dark", label: "Dark", Icon: FaMoon },
  { id: "system", label: "System", Icon: FaDesktop },
];

export function ThemePicker({ signedIn }: { signedIn: boolean }) {
  const mounted = useHydrated();
  const { palette, setPalette } = usePalette();
  const { mode, setMode } = useColorModeSetting(signedIn);

  const committedRef = useRef<ThemeId>(DEFAULT_THEME);
  useEffect(() => {
    committedRef.current = palette;
  }, [palette]);

  useEffect(() => {
    return () => previewPalette(committedRef.current);
  }, []);

  const restore = useCallback(() => previewPalette(committedRef.current), []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-3 font-medium text-foreground text-sm">Color mode</h3>
        <div className="inline-flex rounded-xl border border-border bg-surface p-1">
          {MODE_OPTIONS.map(({ id, label, Icon }) => {
            const active = mounted && mode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-3 font-medium text-foreground text-sm">Palette</h3>
        {/** biome-ignore lint/a11y/noStaticElementInteractions: hover-only preview restore on a non-interactive grid of buttons; keyboard users get the same behavior via each button's onBlur */}
        <div
          className="grid grid-cols-2 gap-4 sm:grid-cols-3"
          onMouseLeave={restore}
        >
          {THEMES.map((def) => {
            const active = mounted && palette === def.id;
            return (
              <button
                key={def.id}
                type="button"
                onMouseEnter={() => previewPalette(def.id)}
                onFocus={() => previewPalette(def.id)}
                onBlur={restore}
                onClick={() => setPalette(def.id)}
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
                  style={{ backgroundColor: def.deep }}
                >
                  <span
                    className="absolute bottom-3 left-3 size-7 rounded-full ring-1 ring-white/15"
                    style={{ backgroundColor: def.vivid }}
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
                  <div className="text-muted-foreground text-xs">
                    {def.blurb}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
