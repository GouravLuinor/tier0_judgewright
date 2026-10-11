"use client";

import { type ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { THEME_STORAGE_KEY } from "../../_lib/constants";

/**
 * Theme root. next-themes owns the `class` attribute on <html>, follows the OS
 * by default, and writes the resolved theme under a tool-specific storage key so
 * it never collides with sibling workstations.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey={THEME_STORAGE_KEY}
    >
      {children}
    </NextThemesProvider>
  );
}
