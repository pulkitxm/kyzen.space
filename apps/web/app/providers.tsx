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
  initialPalette?: ThemeId | null;
  initialMode?: ColorMode | null;
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
