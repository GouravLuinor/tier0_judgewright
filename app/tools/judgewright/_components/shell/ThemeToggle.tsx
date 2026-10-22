"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * Light/dark control in the bezel. A `mounted` gate keeps the pre-hydration
 * render stable (always the Moon icon) so server and first client paint match.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      aria-pressed={isDark}
      title={isDark ? "Switch to light" : "Switch to dark"}
      disabled={!mounted}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] text-bezel-muted transition-colors duration-150 hover:bg-bezel-raised hover:text-bezel-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
