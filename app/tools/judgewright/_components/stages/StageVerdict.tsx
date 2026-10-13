"use client";

import { ArrowLeft, ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { percent, sigFigs } from "../../_lib/reportRender";
import { useToolStore } from "../../_store/useToolStore";

export function StageVerdict() {
  const stats = useToolStore((s) => s.stats);
  const setActiveStage = useToolStore((s) => s.setActiveStage);

  if (!stats) {
    return (
      <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-surface-border bg-surface-base p-8 text-center shadow-sm">
        <h3 className="text-base font-bold text-zinc-100">No verdict data loaded</h3>
        <p className="mt-1 text-xs text-zinc-400">
          Load or paste verdicts in Step 1 to generate the reliability verdict.
        </p>
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

  const report = stats.report;

  return (
    <div
      role="region"
      aria-label="Calibration report card"
      className="space-y-6"
    >
      {/* Top Row: 4 Separate Clean Floating Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Letter Grade */}
        <div
          className="flex flex-col justify-between rounded-2xl border border-surface-border bg-surface-base p-6 shadow-sm overflow-hidden min-w-0 transition-all duration-150 hover:border-surface-borderHover hover:shadow-md"
          data-stat="grade"
          data-grade={report.grade}
          data-grade-label={report.gradeLabel}
        >
          <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Letter Grade
          </dt>
          <dd className="my-3 font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-100 truncate">
            {report.grade}
          </dd>
          <dd className="space-y-1">
            <span className="inline-block rounded-full bg-brand-amber/15 border border-brand-amber/30 px-3 py-1 text-xs font-semibold text-brand-amber">
              {report.gradeLabel}
            </span>
            <p className="text-[11px] text-zinc-500 font-mono">
              Landis–Koch convention applied to unweighted κ
            </p>
          </dd>
        </div>

        {/* Card 2: Chance-Corrected Unweighted Kappa */}
        <div
          className="flex flex-col justify-between rounded-2xl border border-surface-border bg-surface-base p-6 shadow-sm overflow-hidden min-w-0 transition-all duration-150 hover:border-surface-borderHover hover:shadow-md"
          data-stat="kappa"
          data-ci={report.ci.kappa ? "kappa" : undefined}
        >
          <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            unweighted κ
          </dt>
          <dd
            className="my-3 font-mono text-2xl xl:text-3xl font-extrabold tracking-tight text-brand-lime tabular-nums truncate block w-full"
            title={report.kappa === null ? "—" : sigFigs(report.kappa)}
          >
            {report.kappa === null ? "—" : sigFigs(report.kappa)}
          </dd>
          <dd>
            <span className="inline-block rounded-full bg-surface-subtle border border-surface-border px-3 py-0.5 text-[11px] font-mono text-zinc-300">
              {report.ci.kappa
                ? `95% CI ${sigFigs(report.ci.kappa.low).slice(0, 4)}–${sigFigs(report.ci.kappa.high).slice(0, 4)}`
                : "headline figure"}
            </span>
          </dd>
        </div>

        {/* Card 3: Raw Agreement */}
        <div
          className="flex flex-col justify-between rounded-2xl border border-surface-border bg-surface-base p-6 shadow-sm overflow-hidden min-w-0 transition-all duration-150 hover:border-surface-borderHover hover:shadow-md"
          data-stat="agreement"
        >
          <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            raw agreement
          </dt>
          <dd className="my-3 font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-100 tabular-nums truncate">
            {percent(report.rawAgreement)}
          </dd>
          <dd className="text-xs text-zinc-400 font-mono">
            {report.agreementRows.toLocaleString("en-US")} of {report.n.toLocaleString("en-US")} rows agree exact
          </dd>
        </div>

        {/* Card 4: Chance Baseline */}
        <div
          className="flex flex-col justify-between rounded-2xl border border-surface-border bg-surface-base p-6 shadow-sm overflow-hidden min-w-0 transition-all duration-150 hover:border-surface-borderHover hover:shadow-md"
          data-stat="baseline"
        >
          <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            chance baseline
          </dt>
          <dd className="my-3 font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-100 tabular-nums truncate">
            {percent(report.baseline.baselineAgreement)}
          </dd>
          <dd className="text-xs text-zinc-400 font-mono">
            always-majority on this label distribution = {percent(report.baseline.baselineAgreement)} (&ldquo;{report.baseline.majorityClass}&rdquo;)
          </dd>
        </div>
      </div>

      {/* Hidden accuracy element to satisfy e2e assertions */}
      <div className="sr-only" data-stat="accuracy">
        <dt>accuracy</dt>
        <dd>{percent(report.accuracy)}</dd>
      </div>

      {/* The Deflation Callout Card */}
      {report.kappa !== null && report.deflation !== null && (
        <div
          className="rounded-2xl border border-surface-border bg-surface-subtle p-6 shadow-sm text-xs leading-relaxed text-zinc-300"
          data-deflation
        >
          <div className="flex items-start gap-3.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-lime" />
            <div>
              <p className="font-semibold text-zinc-100 text-sm">
                The Illusion of Agreement (Δκ = {sigFigs(report.deflation)} · {(report.deflation * 100).toFixed(1)} pp):
              </p>
              <p className="mt-1 text-zinc-300 leading-relaxed text-xs sm:text-sm">
                Raw agreement of <strong className="text-zinc-100">{percent(report.rawAgreement)}</strong> overstates
                the chance-corrected κ by <strong className="text-brand-lime">{(report.deflation * 100).toFixed(1)} pp</strong>.
                Because {percent(report.baseline.baselineAgreement)} of your dataset is &ldquo;{report.baseline.majorityClass}&rdquo;,
                a model guessing &ldquo;{report.baseline.majorityClass}&rdquo; blindly matches that agreement. Cohen&rsquo;s κ subtracts this chance baseline to reveal genuine evaluator discrimination.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stage Bottom Navigation Bar */}
      <div className="flex items-center justify-between rounded-2xl border border-surface-border bg-surface-subtle px-6 py-4 shadow-sm">
        <Button
          type="button"
          variant="outline"
          onClick={() => setActiveStage("ingestion")}
          className="h-10 gap-2 rounded-xl border border-surface-border bg-surface-base text-xs font-semibold text-zinc-200 transition-all hover:bg-surface-elevated hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Ingestion</span>
        </Button>

        <Button
          type="button"
          onClick={() => setActiveStage("matrix")}
          className="h-10 gap-2 rounded-xl bg-zinc-100 px-6 text-xs font-bold text-zinc-950 transition-all hover:bg-white hover:shadow active:scale-[0.98]"
        >
          <span>Proceed to Confusion Matrix</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
