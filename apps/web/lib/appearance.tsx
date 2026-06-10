"use client";

import { useTheme } from "next-themes";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { clientFetch } from "@/lib/api-client";
import {
  applyGlass,
  DEFAULT_GLASS_MODE,
  GLASS_STORAGE_KEY,
  type GlassMode,
  isValidGlassMode,
} from "@/lib/glass";
import {
  applyPattern,
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

interface GlassContextValue {
  glass: GlassMode;
  setGlass: (id: GlassMode) => void;
}

const GlassContext = createContext<GlassContextValue>({
  glass: DEFAULT_GLASS_MODE,
  setGlass: () => {},
});

export function AppearanceProvider({
  children,
  initialPalette,
  initialMode,
  initialPattern,
  initialGlass,
  signedIn,
}: {
  children: ReactNode;
  initialPalette: ThemeId;
  initialMode: ColorMode | null;
  initialPattern: PatternId;
  initialGlass: GlassMode;
  signedIn: boolean;
}) {
  const { theme: mode, setTheme: setMode } = useTheme();
  const [palette, setPaletteState] = useState<ThemeId>(initialPalette);
  const [pattern, setPatternState] = useState<PatternId>(initialPattern);
  const [glass, setGlassState] = useState<GlassMode>(initialGlass);

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
    if (synced.current) return;
    synced.current = true;

    if (signedIn) {
      try {
        localStorage.setItem(PALETTE_STORAGE_KEY, initialPalette);
        localStorage.setItem(PATTERN_STORAGE_KEY, initialPattern);
        localStorage.setItem(GLASS_STORAGE_KEY, initialGlass);
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
      const storedGlass = localStorage.getItem(GLASS_STORAGE_KEY);
      if (storedGlass && isValidGlassMode(storedGlass))
        setGlassState(storedGlass);
    } catch {}
  }, [
    signedIn,
    initialPalette,
    initialMode,
    initialPattern,
    initialGlass,
    mode,
    setMode,
  ]);

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

  const setGlass = useCallback(
    (id: GlassMode) => {
      setGlassState(id);
      try {
        localStorage.setItem(GLASS_STORAGE_KEY, id);
      } catch {}
      persistAppearance({ glass: id }, signedIn);
    },
    [signedIn],
  );

  const paletteValue = useMemo(
    () => ({ palette, setPalette }),
    [palette, setPalette],
  );
  const patternValue = useMemo(
    () => ({ pattern, setPattern }),
    [pattern, setPattern],
  );
  const glassValue = useMemo(() => ({ glass, setGlass }), [glass, setGlass]);

  return (
    <PaletteContext.Provider value={paletteValue}>
      <PatternContext.Provider value={patternValue}>
        <GlassContext.Provider value={glassValue}>
          {children}
        </GlassContext.Provider>
      </PatternContext.Provider>
    </PaletteContext.Provider>
  );
}

export function usePalette(): PaletteContextValue {
  return use(PaletteContext);
}

export function usePattern(): PatternContextValue {
  return use(PatternContext);
}

export function useGlassMode(): GlassContextValue {
  return use(GlassContext);
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
