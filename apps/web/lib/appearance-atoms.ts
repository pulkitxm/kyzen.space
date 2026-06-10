import {
  DEFAULT_GLASS_MODE,
  DEFAULT_PATTERN,
  DEFAULT_THEME,
  GLASS_STORAGE_KEY,
  PALETTE_STORAGE_KEY,
  PATTERN_STORAGE_KEY,
} from "@gamelobby/shared/constants";
import {
  type GlassMode,
  isValidGlassMode,
  isValidPattern,
  isValidTheme,
  type PatternId,
  type ThemeId,
} from "@gamelobby/shared/types";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export function rawAppearanceStorage<T extends string>(
  isValid: (value: unknown) => value is T,
) {
  return {
    getItem(key: string, initial: T): T {
      if (typeof window === "undefined") return initial;
      try {
        const item = window.localStorage.getItem(key);
        return item !== null && isValid(item) ? item : initial;
      } catch {
        return initial;
      }
    },
    setItem(key: string, value: T): void {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(key, value);
      } catch {}
    },
    removeItem(key: string): void {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.removeItem(key);
      } catch {}
    },
    subscribe(key: string, callback: (value: T) => void, initial: T) {
      if (typeof window === "undefined") return () => {};
      const listener = (e: StorageEvent) => {
        if (e.key !== key || e.storageArea !== window.localStorage) return;
        callback(
          e.newValue !== null && isValid(e.newValue) ? e.newValue : initial,
        );
      };
      window.addEventListener("storage", listener);
      return () => window.removeEventListener("storage", listener);
    },
  };
}

export const paletteAtom = atomWithStorage<ThemeId>(
  PALETTE_STORAGE_KEY,
  DEFAULT_THEME,
  rawAppearanceStorage(isValidTheme),
  { getOnInit: true },
);

export const patternAtom = atomWithStorage<PatternId>(
  PATTERN_STORAGE_KEY,
  DEFAULT_PATTERN,
  rawAppearanceStorage(isValidPattern),
  { getOnInit: true },
);

export const glassAtom = atomWithStorage<GlassMode>(
  GLASS_STORAGE_KEY,
  DEFAULT_GLASS_MODE,
  rawAppearanceStorage(isValidGlassMode),
  { getOnInit: true },
);

export const serverAppearanceAtom = atom(
  null,
  (
    _get,
    set,
    value: { palette: ThemeId; pattern: PatternId; glass: GlassMode },
  ) => {
    set(paletteAtom, value.palette);
    set(patternAtom, value.pattern);
    set(glassAtom, value.glass);
  },
);
