"use client";

import { Activity, TriangleAlert } from "lucide-react";
import { useToolStore } from "../_store/useToolStore";
import { StageStepper } from "./StageStepper";
import { StageIngestion } from "./stages/StageIngestion";
import { StageVerdict } from "./stages/StageVerdict";
import { StageMatrix } from "./stages/StageMatrix";
import { StageDisagreements } from "./stages/StageDisagreements";
import { StageBias } from "./stages/StageBias";
import { StageExport } from "./stages/StageExport";
import { ExportBar } from "./ExportBar";
import type { VerdictAnalysis } from "../_lib/types";

export function AnalyticalWorkbench() {
  const stats = useToolStore((s) => s.stats);
  const errorMessage = useToolStore((s) => s.errorMessage);
  const isProcessing = useToolStore((s) => s.isProcessing);
  const activeStage = useToolStore((s) => s.activeStage);

  const state = errorMessage
    ? "error"
    : stats
      ? "ready"
      : isProcessing
        ? "processing"
        : "idle";

  return (
    <section
      id="report-pane"
      aria-label="Calibration report"
      data-report-state={state}
      className="w-full space-y-6"
    >
      {/* Top 5-Section Stepper Bar */}
      <StageStepper />

      {/* Main Fixed Stage Window */}
      <div className="relative min-h-[460px] w-full">
        {state === "error" && (
          <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-brand-rose/40 bg-brand-rose/10 p-8 text-center shadow-sm">
            <TriangleAlert className="mb-3 h-10 w-10 text-brand-rose" aria-hidden="true" />
            <h3 className="text-base font-bold text-brand-rose">
              Dataset rejected
            </h3>
            <p
              id="report-error-message"
              role="alert"
              className="mt-1.5 max-w-md text-xs sm:text-sm leading-relaxed text-zinc-300 font-mono"
            >
              {errorMessage}
            </p>
          </div>
        )}

        {state === "processing" && (
          <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-surface-border bg-surface-base p-8 text-center shadow-sm">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-brand-lime border-t-transparent" />
            <p className="mt-3 font-mono text-xs sm:text-sm text-zinc-300">
              Calibrating verdicts in Web Worker…
            </p>
          </div>
        )}

        {/* The 6 Discrete Stage Panels */}
        <div className={activeStage === "ingestion" && state !== "error" && state !== "processing" ? "block" : "hidden"}>
          <StageIngestion />
        </div>

        <div className={activeStage === "verdict" && state !== "error" && state !== "processing" ? "block" : "hidden"}>
          <StageVerdict />
        </div>

        <div className={activeStage === "matrix" && state !== "error" && state !== "processing" ? "block" : "hidden"}>
          <StageMatrix />
        </div>

        <div className={activeStage === "disagreements" && state !== "error" && state !== "processing" ? "block" : "hidden"}>
          <StageDisagreements />
        </div>

        <div className={activeStage === "bias" && state !== "error" && state !== "processing" ? "block" : "hidden"}>
          <StageBias />
        </div>

        <div className={activeStage === "export" && state !== "error" && state !== "processing" ? "block" : "hidden"}>
          <StageExport />
        </div>
      </div>

      {/* Dataset Statistics & Quick Export Bar */}
      {stats && (
        <div className="space-y-4 pt-5 border-t border-surface-border">
          <ExportBar stats={stats} />
          <CountsRow stats={stats} />
        </div>
      )}
    </section>
  );
}

function CountsRow({ stats }: { stats: VerdictAnalysis }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 font-mono text-xs text-zinc-400">
      <dl className="flex items-center gap-4">
        <div data-stat="characters" className="flex items-center gap-1">
          <dt className="sr-only">characters</dt>
          <dd className="text-zinc-200 font-bold">{stats.characterCount.toLocaleString("en-US")}</dd>
          <span>chars</span>
        </div>
        <span>•</span>
        <div data-stat="words" className="flex items-center gap-1">
          <dt className="sr-only">words</dt>
          <dd className="text-zinc-200 font-bold">{stats.wordCount.toLocaleString("en-US")}</dd>
          <span>words</span>
        </div>
        <span>•</span>
        <div data-stat="bytes" className="flex items-center gap-1">
          <dt className="sr-only">bytes</dt>
          <dd className="text-zinc-200 font-bold">{stats.byteCount.toLocaleString("en-US")}</dd>
          <span>bytes</span>
        </div>
        <span>•</span>
        <div data-stat="lines" className="flex items-center gap-1">
          <dt className="sr-only">lines</dt>
          <dd className="text-zinc-200 font-bold">{stats.lineCount.toLocaleString("en-US")}</dd>
          <span>lines</span>
        </div>
      </dl>

      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-md border border-brand-lime/30 bg-brand-lime/10 px-2 py-0.5 text-[11px] text-brand-lime font-mono"
          data-engine={stats.engine}
        >
          <Activity className="h-3 w-3" />
          {stats.engine}
        </span>
        <span className="text-zinc-400 font-mono text-[11px]">
          {stats.report.executionTimeMs}ms
        </span>
      </div>
    </div>
  );
}
