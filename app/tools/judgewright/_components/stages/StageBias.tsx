"use client";

import { ArrowLeft, ArrowRight, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CalibrationControls } from "../CalibrationControls";
import { BiasReadout, CalibrationReadout } from "../ReportInsights";
import { useToolStore } from "../../_store/useToolStore";

export function StageBias() {
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
      {/* Top Setting Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-surface-border bg-surface-base p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-brand-lime" />
            <h3 className="text-base font-bold text-zinc-100">
              Score Calibration Semantics
            </h3>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Define whether <code className="text-zinc-200">judge_score</code> represents probability of positive class or emitted confidence.
          </p>
        </div>
        <CalibrationControls />
      </div>

      {/* Two Clean Floating Cards: Calibration & Bias */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-surface-border bg-surface-base p-6 sm:p-7 shadow-sm">
          <CalibrationReadout report={report} />
        </div>

        <div className="rounded-2xl border border-surface-border bg-surface-base p-6 sm:p-7 shadow-sm">
          <BiasReadout report={report} />
        </div>
      </div>

      {/* Stage Bottom Navigation Bar */}
      <div className="flex items-center justify-between rounded-2xl border border-surface-border bg-surface-subtle px-6 py-4 shadow-sm">
        <Button
          type="button"
          variant="outline"
          onClick={() => setActiveStage("disagreements")}
          className="h-10 gap-2 rounded-xl border border-surface-border bg-surface-base text-xs font-semibold text-zinc-200 transition-all hover:bg-surface-elevated hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Disagreements</span>
        </Button>

        <Button
          type="button"
          onClick={() => setActiveStage("export")}
          className="h-10 gap-2 rounded-xl bg-zinc-100 px-6 text-xs font-bold text-zinc-950 transition-all hover:bg-white hover:shadow active:scale-[0.98]"
        >
          <span>Proceed to Export &amp; Receipt</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
