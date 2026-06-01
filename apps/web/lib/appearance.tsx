"use client";

import { useTheme } from "next-themes";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { clientFetch } from "@/lib/api-client";
import {
  DEFAULT_PATTERN,
  isValidPattern,
  PATTERN_STORAGE_KEY,
  type PatternId,
} from "@/lib/patterns";
import {
  type ColorMode,
  DEFAULT_THEME,
  isValidTheme,
  PALETTE_STORAGE_KEY,
  type ThemeId,
} from "@/lib/themes";

/** Persist an appearance change for signed-in users (fire-and-forget). */
function persistAppearance(
  patch: { theme?: ThemeId; colorMode?: ColorMode; pattern?: PatternId },
  signedIn: boolean,
) {
  if (!signedIn) return;
  void clientFetch("/api/profiles/me/appearance", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch((err) => {
    // Non-blocking: the local change already applied. A failed sync just means
    // another device won't see it until the next change — but surface it in the
    // console so a rejected save (e.g. a server-side validation error) isn't lost
    // silently and reverted on the next reload.
    console.warn("Failed to persist appearance change", err);
  });
}

interface PaletteContextValue {
  palette: ThemeId;
  setPalette: (id: ThemeId) => void;
}

const PaletteContext = createContext<PaletteContextValue>({
  palette: DEFAULT_THEME,
  setPalette: () => {},
});

interface PatternContextValue {
  pattern: PatternId;
  setPattern: (id: PatternId) => void;
}

const PatternContext = createContext<PatternContextValue>({
  pattern: DEFAULT_PATTERN,
  setPattern: () => {},
});

export function AppearanceProvider({
  children,
  initialPalette,
  initialMode,
  initialPattern,
  signedIn,
}: {
  children: ReactNode;
  initialPalette: ThemeId;
  initialMode: ColorMode | null;
  initialPattern: PatternId;
  signedIn: boolean;
}) {
  const { theme: mode, setTheme: setMode } = useTheme();
  const [palette, setPaletteState] = useState<ThemeId>(initialPalette);
  const [pattern, setPatternState] = useState<PatternId>(initialPattern);

  // Reflect the palette + pattern onto <html data-theme>/<html data-pattern>.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", palette);
  }, [palette]);
  useEffect(() => {
    document.documentElement.setAttribute("data-pattern", pattern);
  }, [pattern]);

  // Reconcile persisted preferences once on mount: the DB wins for signed-in
  // users (so a choice made on another device shows here); otherwise fall back
  // to localStorage (next-themes already restores the mode from localStorage).
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current) return;
    synced.current = true;

    if (signedIn) {
      // State already initialises to the DB values; just mirror them to
      // localStorage and reconcile the mode (next-themes) if the DB differs.
      try {
        localStorage.setItem(PALETTE_STORAGE_KEY, initialPalette);
        localStorage.setItem(PATTERN_STORAGE_KEY, initialPattern);
      } catch {}
      if (initialMode && mode !== initialMode) setMode(initialMode);
      return;
    }

    try {
      const storedPalette = localStorage.getItem(PALETTE_STORAGE_KEY);
      if (storedPalette && isValidTheme(storedPalette))
        setPaletteState(storedPalette);
      const storedPattern = localStorage.getItem(PATTERN_STORAGE_KEY);
      if (storedPattern && isValidPattern(storedPattern))
        setPatternState(storedPattern);
    } catch {}
  }, [signedIn, initialPalette, initialMode, initialPattern, mode, setMode]);

  const setPalette = useCallback(
    (id: ThemeId) => {
      setPaletteState(id);
      try {
        localStorage.setItem(PALETTE_STORAGE_KEY, id);
      } catch {}
      persistAppearance({ theme: id }, signedIn);
    },
    [signedIn],
  );

  const setPattern = useCallback(
    (id: PatternId) => {
      setPatternState(id);
      try {
        localStorage.setItem(PATTERN_STORAGE_KEY, id);
      } catch {}
      persistAppearance({ pattern: id }, signedIn);
    },
    [signedIn],
  );

  return (
    <PaletteContext.Provider value={{ palette, setPalette }}>
      <PatternContext.Provider value={{ pattern, setPattern }}>
        {children}
      </PatternContext.Provider>
    </PaletteContext.Provider>
  );
}

export function usePalette(): PaletteContextValue {
  return useContext(PaletteContext);
}

export function usePattern(): PatternContextValue {
  return useContext(PatternContext);
}

/**
 * Reads + sets the light/dark/system mode via next-themes, persisting the
 * choice to the DB for signed-in users.
 */
export function useColorModeSetting(signedIn: boolean) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const setMode = useCallback(
    (next: ColorMode) => {
      setTheme(next);
      persistAppearance({ colorMode: next }, signedIn);
    },
    [setTheme, signedIn],
  );

  return {
    mode: theme as ColorMode | undefined,
    resolvedMode: resolvedTheme as "light" | "dark" | undefined,
    setMode,
  };
}
