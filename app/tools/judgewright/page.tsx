"use client";

import { Lock, ShieldCheck, Sigma, TriangleAlert } from "lucide-react";
import { Toaster } from "@/components/ui/toast";
import { useToolWorker } from "./_hooks/useToolWorker";
import { useKeyboardShortcuts } from "./_hooks/useKeyboardShortcuts";
import { AnalyticalWorkbench } from "./_components/AnalyticalWorkbench";
import { StatusLiveRegion } from "./_components/StatusLiveRegion";
import { SiteHeader } from "./_components/SiteHeader";
import { StudioFooter } from "./_components/StudioFooter";
import { CommandPalette } from "./_components/CommandPalette";
import { CompetitorMatrix } from "./_components/CompetitorMatrix";
import { KnowledgeHub } from "./_components/KnowledgeHub";
import { FaqSection } from "./_components/FaqSection";
import { SignInModal } from "./_components/auth/SignInModal";
import { useToolStore } from "./_store/useToolStore";

const TOOL_NAME = "Judgewright";

const TRUST_PILLS = [
  {
    id: "browser",
    label: "100% in-browser",
    icon: <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-brand-lime" aria-hidden="true" />,
  },
  {
    id: "kappa",
    label: "Chance-corrected κ",
    icon: <Sigma className="h-3.5 w-3.5 shrink-0 text-brand-lime" aria-hidden="true" />,
  },
  {
    id: "account",
    label: "No account required",
    icon: <Lock className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />,
  },
];

const TAGLINE =
  "Calibrate your LLM judge against human raters — chance-corrected agreement, confusion heatmaps, and failure inspection with zero server egress.";

export default function ToolPage() {
  useToolWorker();
  useKeyboardShortcuts();

  const isWorkerAvailable = useToolStore((s) => s.isWorkerAvailable);

  return (
    <div className="min-h-screen bg-canvas text-zinc-100 selection:bg-brand-lime/30 selection:text-zinc-100">
      <a
        href="#workstation"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:border focus:border-surface-border focus:bg-surface-elevated focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-lime"
      >
        Skip to workstation
      </a>

      <SiteHeader />

      <main className="relative w-full overflow-x-hidden flex flex-col gap-10 pb-20">
        <div className="mx-auto w-full max-w-[1536px] px-4 pt-8 md:px-8 lg:px-10">
          {/* Workstation Header */}
          <header className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="whitespace-nowrap text-2xl font-extrabold tracking-tight text-zinc-100 sm:text-3xl lg:text-4xl">
                  {TOOL_NAME}
                </h1>
                <span className="shrink-0 rounded-full border border-surface-border bg-surface-subtle px-3 py-1 text-xs font-semibold text-zinc-300">
                  calibration instrument · in-browser worker
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-xs sm:text-sm text-zinc-400 leading-relaxed">{TAGLINE}</p>
            </div>

            <div className="flex shrink-0 items-center divide-x divide-surface-border rounded-xl border border-surface-border bg-surface-subtle px-1 py-1 shadow-sm">
              {TRUST_PILLS.map((pill) => (
                <div
                  key={pill.id}
                  className="flex items-center gap-2 px-3.5 py-1"
                >
                  {pill.icon}
                  <span className="text-xs font-semibold text-zinc-300">{pill.label}</span>
                </div>
              ))}
            </div>
          </header>

          {/* Fixed-Stage Workstation Canvas */}
          <section
            id="workstation"
            aria-label="Interactive Workspace"
            className="w-full scroll-mt-20"
          >
            {isWorkerAvailable === false && (
              <div
                id="worker-degraded-banner"
                role="status"
                className="mb-4 flex items-start gap-2 rounded-xl border border-brand-amber/40 bg-brand-amber/10 px-4 py-2.5 text-xs text-brand-amber"
              >
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Web Worker unavailable — computing on the main thread (same core, CIs capped).
                </span>
              </div>
            )}

            <AnalyticalWorkbench />
          </section>
        </div>

        {/* Reference Documentation & Specs */}
        <CompetitorMatrix />
        <KnowledgeHub />
        <FaqSection />
      </main>

      <StudioFooter />

      <StatusLiveRegion />
      <CommandPalette />
      <SignInModal />
      <Toaster />
    </div>
  );
}
