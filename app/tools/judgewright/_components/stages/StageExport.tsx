"use client";

import dynamic from "next/dynamic";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExportBar } from "../ExportBar";
import { useToolStore } from "../../_store/useToolStore";

const DiagnosisPanel = dynamic(
  () => import("../DiagnosisPanel").then((m) => m.DiagnosisPanel),
  { ssr: false }
);

export function StageExport() {
  const stats = useToolStore((s) => s.stats);
  const setActiveStage = useToolStore((s) => s.setActiveStage);

  const report = stats?.report;

  if (!report) {
    return (
      <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-surface-border bg-surface-base p-8 text-center shadow-sm">
        <p className="text-xs text-zinc-400">Load verdicts first in Stage 1.</p>
        <Button
          type="button"
          onClick={() => setActiveStage("ingestion")}
          className="mt-4 h-9 rounded-xl bg-brand-lime px-4 text-xs font-semibold text-black transition-all hover:opacity-90 active:scale-[0.98]"
        >
          Go to Ingestion
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Export Bar Card */}
      <div className="rounded-2xl border border-surface-border bg-surface-base p-6 sm:p-7 shadow-sm">
        <h3 className="text-base sm:text-lg font-bold tracking-tight text-zinc-100 mb-3">
          1-Click Report Exports
        </h3>
        <ExportBar stats={stats} />
      </div>

      {/* Reproducibility Receipt Card */}
      <div className="rounded-2xl border border-surface-border bg-surface-base p-6 sm:p-7 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-bold tracking-tight text-zinc-100">
            Scientific Audit Certificate (17 Significant Digits)
          </h3>
          <span className="font-mono text-xs text-zinc-500">
            Bit-identical mulberry32 RNG
          </span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Byte-reproducible parameters to independently verify every calculation in your own pipeline.
        </p>
        <pre
          className="overflow-x-auto rounded-xl border border-surface-border bg-surface-subtle p-4 font-mono text-xs leading-relaxed text-zinc-300"
          data-receipt
        >
          {report.receipt}
        </pre>
      </div>

      {/* Optional BYOK LLM Diagnosis */}
      <div className="rounded-2xl border border-surface-border bg-surface-base p-6 sm:p-7 shadow-sm">
        <DiagnosisPanel />
      </div>

      {/* Stage Bottom Navigation Bar */}
      <div className="flex items-center justify-between rounded-2xl border border-surface-border bg-surface-subtle px-6 py-4 shadow-sm">
        <Button
          type="button"
          variant="outline"
          onClick={() => setActiveStage("bias")}
          className="h-10 gap-2 rounded-xl border border-surface-border bg-surface-base text-xs font-semibold text-zinc-200 transition-all hover:bg-surface-elevated hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Bias Radar</span>
        </Button>

        <Button
          type="button"
          onClick={() => setActiveStage("ingestion")}
          className="h-10 gap-2 rounded-xl border border-surface-border bg-surface-base text-xs font-semibold text-zinc-200 transition-all hover:bg-surface-elevated hover:text-zinc-100"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Start New Evaluation</span>
        </Button>
      </div>
    </div>
  );
}
