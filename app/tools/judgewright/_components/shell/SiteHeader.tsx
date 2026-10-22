"use client";

import { Command } from "lucide-react";
import { useToolStore } from "../../_store/useToolStore";
import { SignInButton } from "../auth/SignInButton";
import { BrandMark } from "./BrandMark";
import { SamplesMenu } from "./SamplesMenu";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "#workstation", label: "Calibrate" },
  { href: "#guide", label: "Method" },
  { href: "#matrix", label: "Compare" },
  { href: "#faq", label: "FAQ" },
];

/** The bezel: the chart's charcoal frame, in both themes. */
export function SiteHeader() {
  const setCommandPaletteOpen = useToolStore((s) => s.setCommandPaletteOpen);

  return (
    <header className="sticky top-0 z-40 border-b border-bezel-line bg-bezel text-bezel-ink">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <a
          href="/tools/judgewright"
          aria-label="Judgewright, home"
          className="flex items-center gap-2.5 rounded-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select focus-visible:ring-offset-2 focus-visible:ring-offset-bezel"
        >
          <BrandMark />
          <span className="text-[17px] font-semibold tracking-[-0.01em] [font-stretch:87.5%]">
            Judgewright
          </span>
        </a>

        <nav aria-label="Sections" className="ml-6 hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-[3px] px-2.5 py-1.5 text-sm text-bezel-muted transition-colors duration-150 hover:bg-bezel-raised hover:text-bezel-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <div className="hidden sm:block">
            <SamplesMenu tone="bezel" />
          </div>
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            aria-label="Open command palette"
            className="hidden h-9 w-9 items-center justify-center rounded-[3px] text-bezel-muted transition-colors duration-150 hover:bg-bezel-raised hover:text-bezel-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select lg:inline-flex"
          >
            <Command className="h-4 w-4" aria-hidden="true" />
          </button>
          <ThemeToggle />
          <SignInButton />
        </div>
      </div>
    </header>
  );
}
