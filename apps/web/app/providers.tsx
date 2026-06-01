"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { AppearanceProvider } from "@/lib/appearance";
import { DEFAULT_PATTERN, type PatternId } from "@/lib/patterns";
import {
  type ColorMode,
  DEFAULT_COLOR_MODE,
  DEFAULT_THEME,
  type ThemeId,
} from "@/lib/themes";

export function Providers({
  children,
  initialPalette,
  initialMode,
  initialPattern,
  signedIn,
}: {
  children: ReactNode;
  /** The signed-in user's persisted palette, or null when signed out. */
  initialPalette?: ThemeId | null;
  /** The signed-in user's persisted color mode, or null when signed out. */
  initialMode?: ColorMode | null;
  /** The signed-in user's persisted background pattern, or null when signed out. */
  initialPattern?: PatternId | null;
  signedIn: boolean;
}) {
  return (
    <ThemeProvider
      attribute="class"
      themes={["light", "dark"]}
      defaultTheme={initialMode ?? DEFAULT_COLOR_MODE}
      enableSystem
      disableTransitionOnChange
      storageKey="gl-color-mode"
    >
      <AppearanceProvider
        initialPalette={initialPalette ?? DEFAULT_THEME}
        initialMode={initialMode ?? null}
        initialPattern={initialPattern ?? DEFAULT_PATTERN}
        signedIn={signedIn}
      >
        {children}
      </AppearanceProvider>
    </ThemeProvider>
  );
}
