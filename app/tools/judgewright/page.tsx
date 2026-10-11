"use client";

import { Check, Cpu, Lock, ShieldCheck, Sigma, TriangleAlert } from "lucide-react";
import { Keycap } from "@/components/ui/keycap";
import { Toaster } from "@/components/ui/toast";
import { useToolWorker } from "./_hooks/useToolWorker";
import { useKeyboardShortcuts } from "./_hooks/useKeyboardShortcuts";
import { TopToolbar } from "./_components/TopToolbar";
import { RawEditorPane } from "./_components/RawEditorPane";
import { ReportPane } from "./_components/ReportPane";
import { StatusLiveRegion } from "./_components/StatusLiveRegion";
import { SiteHeader } from "./_components/SiteHeader";
import { StudioFooter } from "./_components/StudioFooter";
import { CommandPalette } from "./_components/CommandPalette";
import { CompetitorMatrix } from "./_components/CompetitorMatrix";
import { KnowledgeHub } from "./_components/KnowledgeHub";
import { FaqSection } from "./_components/FaqSection";
import { SignInModal } from "./_components/auth/SignInModal";
import { TOOL_NAME } from "./_lib/constants";
import { useToolStore } from "./_store/useToolStore";

const TRUST_PILLS = [
  {
    id: "egress",
    label: "100% in-browser",
    icon: <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-brand-lime" aria-hidden="true" />,
  },
  {
    id: "reliability",
    label: "Chance-corrected κ",
    icon: <Sigma className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />,
  },
  {
    id: "account",
    label: "No account required",
    icon: <Lock className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />,
  },
];

const TAGLINE =
  "Paste a rubric and a set of verdicts — get a calibration report card with error bars, computed entirely in your browser.";

export default function ToolPage() {
  useToolWorker();
  useKeyboardShortcuts();

  const isWorkerAvailable = useToolStore((s) => s.isWorkerAvailable);
  const isProcessing = useToolStore((s) => s.isProcessing);
  const errorMessage = useToolStore((s) => s.errorMessage);
  const verdictsText = useToolStore((s) => s.verdictsText);
  const stats = useToolStore((s) => s.stats);
  const degraded = useToolStore((s) => s.degraded);

  const stateLabel = errorMessage
    ? "Rejected"
    : isProcessing
      ? "Computing"
      : stats
        ? degraded
          ? "Settled (main thread)"
          : "Settled"
        : "Idle";

  return (
    <>
      <a
        href="#workstation"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:border focus:border-surface-border focus:bg-surface-default focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-lime/70 focus:shadow-elevated"
      >
        Skip to workstation
      </a>

      <SiteHeader />

      <main className="relative w-full overflow-x-hidden flex flex-col gap-4 md:gap-8">
        <section
          aria-label={`${TOOL_NAME} workstation`}
          className="mx-auto w-full max-w-7xl px-4 pb-6 pt-4 md:px-6 md:pt-5 lg:px-8"
        >
          {/* Station header: the single <h1>, the tagline, the trust pills */}
          <header className="mb-3 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="whitespace-nowrap text-xl font-bold tracking-tight text-ink sm:text-2xl">
                  {TOOL_NAME}
                </h1>
                <span className="shrink-0 rounded-md border border-surface-border bg-surface-subtle px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                  calibration instrument · worker pipeline
                </span>
              </div>
              <p className="mt-0.5 max-w-xl text-xs text-zinc-400">{TAGLINE}</p>
            </div>

            <ul className="flex shrink-0 flex-wrap items-center gap-2">
              {TRUST_PILLS.map((pill) => (
                <li
                  key={pill.id}
                  className="flex items-center gap-1.5 rounded-md border border-surface-border bg-surface-subtle/50 px-2.5 py-1 font-mono text-[11px]"
                >
                  {pill.icon}
                  <span className="font-medium text-zinc-300">{pill.label}</span>
                </li>
              ))}
            </ul>
          </header>

          {/* The one workstation card */}
          <div
            id="workstation"
            className="flex flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface-base glass-edge scroll-mt-20"
          >
            <TopToolbar />

            {isWorkerAvailable === false && (
              <div
                id="worker-degraded-banner"
                role="status"
                className="flex items-start gap-2 border-b border-surface-border bg-brand-amber/10 px-4 py-2.5 font-mono text-xs text-brand-amber"
              >
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Web Worker unavailable — computing on the main thread (same
                  core, CIs capped). Pathological payloads may degrade
                  responsiveness.
                </span>
              </div>
            )}

            <section
              aria-label="Interactive Workspace"
              className="grid grid-cols-1 divide-y divide-surface-border overflow-hidden lg:h-[620px] lg:grid-cols-2 lg:divide-x lg:divide-y-0"
            >
              <div className="h-full min-h-0 overflow-hidden" data-panel>
                <RawEditorPane />
              </div>
              <div className="h-full min-h-0 overflow-hidden" data-panel>
                <ReportPane />
              </div>
            </section>

            {/* Status strip: state · rows · chars · ms */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border bg-surface-subtle/30 px-4 py-2 font-mono text-[11px] text-zinc-400 select-none">
              <div className="flex items-center gap-3">
                {isProcessing ? (
                  <span className="flex items-center gap-1.5 text-zinc-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-lime motion-reduce:animate-none" />
                    Computing…
                  </span>
                ) : errorMessage ? (
                  <span className="flex items-center gap-1.5 font-medium text-brand-rose">
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                    Rejected
                  </span>
                ) : stats ? (
                  <span className="flex items-center gap-1.5 text-zinc-300">
                    <Check className="h-3.5 w-3.5 text-brand-lime" aria-hidden="true" />
                    {stateLabel}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-zinc-300">
                    <Cpu className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                    Idle
                  </span>
                )}
                <span aria-hidden="true">•</span>
                <span>
                  <strong className="tabular-nums text-zinc-200">
                    {verdictsText.split("\n").filter((line) => line.trim()).length}
                  </strong>{" "}
                  rows
                </span>
                <span aria-hidden="true">•</span>
                <span>
                  <strong className="tabular-nums text-zinc-200">
                    {(stats?.characterCount ?? verdictsText.length).toLocaleString("en-US")}
                  </strong>{" "}
                  chars
                </span>
                <span aria-hidden="true">•</span>
                <span className="hidden sm:inline">
                  <strong className="tabular-nums text-brand-lime">
                    {stats?.report.kappa === null || stats?.report.kappa === undefined
                      ? "undefined"
                      : stats.report.kappa.toPrecision(17)}
                  </strong>{" "}
                  κ
                </span>
                <span aria-hidden="true">•</span>
                <span>
                  <strong className="tabular-nums text-zinc-200">
                    {stats ? `${stats.executionTimeMs}ms` : "—"}
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden items-center gap-3 md:flex">
                  <span className="flex items-center gap-1.5">
                    <Keycap size="xs">⌘K</Keycap> Commands
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Keycap size="xs">⌘P</Keycap> Samples
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Keycap size="xs">⌘⇧C</Keycap> Copy
                  </span>
                </div>
                <span className="hidden text-zinc-600 md:inline" aria-hidden="true">
                  /
                </span>
                <div className="flex items-center gap-1.5">
                  <span>100% In-Browser</span>
                  <span className="text-zinc-600" aria-hidden="true">
                    /
                  </span>
                  <span className="font-medium text-brand-lime">0 byte egress</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <CompetitorMatrix />
        <KnowledgeHub />
        <FaqSection />
      </main>

      <StudioFooter />

      <StatusLiveRegion />
      <CommandPalette />
      <SignInModal />
      <Toaster />
    </>
  );
}
