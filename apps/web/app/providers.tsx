"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Mirrors the usual Next + next-themes setup (e.g. class on `html`,
 * default system + persisted preference).
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
