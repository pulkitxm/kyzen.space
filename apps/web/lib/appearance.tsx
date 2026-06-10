"use client";

import { useAtom, useSetAtom } from "jotai";
import { useTheme } from "next-themes";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { clientFetch } from "@/lib/api-client";
import {
  glassAtom,
  paletteAtom,
  patternAtom,
  serverAppearanceAtom,
} from "@/lib/appearance-atoms";
import { applyGlass, DEFAULT_GLASS_MODE, type GlassMode } from "@/lib/glass";
import { applyPattern, DEFAULT_PATTERN, type PatternId } from "@/lib/patterns";
import { type ColorMode, DEFAULT_THEME, type ThemeId } from "@/lib/themes";

function persistAppearance(
  patch: {
    theme?: ThemeId;
    colorMode?: ColorMode;
    pattern?: PatternId;
    glass?: GlassMode;
  },
  signedIn: boolean,
) {
  if (!signedIn) return;
  void clientFetch("/api/profiles/me/appearance", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch((err) => {
    console.warn("Failed to persist appearance change", err);
  });
}

interface AppearanceServerState {
  signedIn: boolean;
  initialPalette: ThemeId;
  initialMode: ColorMode | null;
  initialPattern: PatternId;
  initialGlass: GlassMode;
}

const AppearanceContext = createContext<AppearanceServerState>({
  signedIn: false,
  initialPalette: DEFAULT_THEME,
  initialMode: null,
  initialPattern: DEFAULT_PATTERN,
  initialGlass: DEFAULT_GLASS_MODE,
});

export function AppearanceProvider({
  children,
  signedIn,
  initialPalette,
  initialMode,
  initialPattern,
  initialGlass,
}: AppearanceServerState & { children: ReactNode }) {
  const value = useMemo(
    () => ({
      signedIn,
      initialPalette,
      initialMode,
      initialPattern,
      initialGlass,
    }),
    [signedIn, initialPalette, initialMode, initialPattern, initialGlass],
  );
  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function AppearanceSync() {
  const {
    signedIn,
    initialPalette,
    initialMode,
    initialPattern,
    initialGlass,
  } = use(AppearanceContext);
  const { theme: mode, setTheme: setMode } = useTheme();
  const [palette] = useAtom(paletteAtom);
  const [pattern] = useAtom(patternAtom);
  const [glass] = useAtom(glassAtom);
  const setServerAppearance = useSetAtom(serverAppearanceAtom);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", palette);
  }, [palette]);
  useEffect(() => {
    applyPattern(document.documentElement, pattern);
  }, [pattern]);
  useEffect(() => {
    applyGlass(document.documentElement, glass);
  }, [glass]);

  const synced = useRef(false);
  useEffect(() => {
    if (synced.current || !signedIn) return;
    synced.current = true;
    setServerAppearance({
      palette: initialPalette,
      pattern: initialPattern,
      glass: initialGlass,
    });
    if (initialMode && mode !== initialMode) setMode(initialMode);
  }, [
    signedIn,
    initialPalette,
    initialMode,
    initialPattern,
    initialGlass,
    mode,
    setMode,
    setServerAppearance,
  ]);

  return null;
}

export function usePalette() {
  const { signedIn } = use(AppearanceContext);
  const [palette, setPaletteValue] = useAtom(paletteAtom);
  const setPalette = useCallback(
    (id: ThemeId) => {
      setPaletteValue(id);
      persistAppearance({ theme: id }, signedIn);
    },
    [setPaletteValue, signedIn],
  );
  return { palette, setPalette };
}

export function usePattern() {
  const { signedIn } = use(AppearanceContext);
  const [pattern, setPatternValue] = useAtom(patternAtom);
  const setPattern = useCallback(
    (id: PatternId) => {
      setPatternValue(id);
      persistAppearance({ pattern: id }, signedIn);
    },
    [setPatternValue, signedIn],
  );
  return { pattern, setPattern };
}

export function useGlassMode() {
  const { signedIn } = use(AppearanceContext);
  const [glass, setGlassValue] = useAtom(glassAtom);
  const setGlass = useCallback(
    (id: GlassMode) => {
      setGlassValue(id);
      persistAppearance({ glass: id }, signedIn);
    },
    [setGlassValue, signedIn],
  );
  return { glass, setGlass };
}

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
