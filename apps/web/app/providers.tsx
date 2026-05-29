"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";

/**
 * Mirrors the usual Next + next-themes setup (e.g. class on `html`,
 * default system + persisted preference).
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
