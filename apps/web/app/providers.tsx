"use client";

import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { AppearanceProvider } from "@/lib/appearance";
import { DEFAULT_GLASS_MODE, type GlassMode } from "@/lib/glass";
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
  initialGlass,
  signedIn,
}: {
  children: ReactNode;
  initialPalette?: ThemeId | null;
  initialMode?: ColorMode | null;
  initialPattern?: PatternId | null;
  initialGlass?: GlassMode | null;
  signedIn: boolean;
}) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
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
            initialGlass={initialGlass ?? DEFAULT_GLASS_MODE}
            signedIn={signedIn}
          >
            {children}
          </AppearanceProvider>
        </ThemeProvider>
      </MotionConfig>
    </LazyMotion>
  );
}
