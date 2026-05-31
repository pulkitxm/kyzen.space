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
  type ColorMode,
  DEFAULT_THEME,
  isValidTheme,
  PALETTE_STORAGE_KEY,
  type ThemeId,
} from "@/lib/themes";

/** Persist an appearance change for signed-in users (fire-and-forget). */
function persistAppearance(
  patch: { theme?: ThemeId; colorMode?: ColorMode },
  signedIn: boolean,
) {
  if (!signedIn) return;
  void clientFetch("/api/profiles/me/appearance", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => {
    // Non-blocking: the local change already applied. A failed sync just means
    // another device won't see it until the next change.
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

export function AppearanceProvider({
  children,
  initialPalette,
  initialMode,
  signedIn,
}: {
  children: ReactNode;
  initialPalette: ThemeId;
  initialMode: ColorMode | null;
  signedIn: boolean;
}) {
  const { theme: mode, setTheme: setMode } = useTheme();
  const [palette, setPaletteState] = useState<ThemeId>(initialPalette);

  // Reflect the palette onto <html data-theme> whenever it changes.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", palette);
  }, [palette]);

  // Reconcile persisted preferences once on mount: the DB wins for signed-in
  // users (so a choice made on another device shows here); otherwise fall back
  // to localStorage (next-themes already restores the mode from localStorage).
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current) return;
    synced.current = true;

    if (signedIn) {
      // State already initialises to initialPalette; just mirror it to
      // localStorage and reconcile the mode (next-themes) if the DB differs.
      try {
        localStorage.setItem(PALETTE_STORAGE_KEY, initialPalette);
      } catch {}
      if (initialMode && mode !== initialMode) setMode(initialMode);
      return;
    }

    try {
      const stored = localStorage.getItem(PALETTE_STORAGE_KEY);
      if (stored && isValidTheme(stored)) setPaletteState(stored);
    } catch {}
  }, [signedIn, initialPalette, initialMode, mode, setMode]);

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

  return (
    <PaletteContext.Provider value={{ palette, setPalette }}>
      {children}
    </PaletteContext.Provider>
  );
}

export function usePalette(): PaletteContextValue {
  return useContext(PaletteContext);
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
