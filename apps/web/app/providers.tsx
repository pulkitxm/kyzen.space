"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { AppearanceProvider } from "@/lib/appearance";
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
  signedIn,
}: {
  children: ReactNode;
  /** The signed-in user's persisted palette, or null when signed out. */
  initialPalette?: ThemeId | null;
  /** The signed-in user's persisted color mode, or null when signed out. */
  initialMode?: ColorMode | null;
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
        signedIn={signedIn}
      >
        {children}
      </AppearanceProvider>
    </ThemeProvider>
  );
}
