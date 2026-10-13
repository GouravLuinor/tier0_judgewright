"use client";

import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { SignInButton } from "./auth/SignInButton";
import { KnowledgeDrawer } from "./KnowledgeDrawer";

const NAV = [
  { href: "#workstation", label: "Workstation" },
  { href: "#guide", label: "Guide & Schema" },
  { href: "#faq", label: "FAQ" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-surface-border bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1536px] items-center justify-between gap-4 px-4 py-3 sm:px-8 lg:px-10">
        <Link
          href="/"
          aria-label="Judgewright — home"
          className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime/70"
        >
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-xl border border-surface-border bg-surface-elevated font-mono text-base font-extrabold leading-none text-brand-lime glass-edge"
          >
            κ
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-sm font-bold tracking-tight text-zinc-100">
              Judgewright
            </span>
            <span className="block truncate text-[11px] text-zinc-400">
              Calibration instrument for LLM judges
            </span>
          </span>
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-1.5 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-1.5 font-mono text-xs font-medium text-zinc-400 transition-colors duration-150 hover:bg-surface-subtle hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime/70"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2.5">
          <KnowledgeDrawer />
          <ThemeToggle />
          <SignInButton />
        </div>
      </div>
    </header>
  );
}
