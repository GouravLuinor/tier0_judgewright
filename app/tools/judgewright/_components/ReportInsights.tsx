"use client";

import { sigFigs } from "../_lib/reportRender";
import { useToolStore } from "../_store/useToolStore";
import { Button } from "@/components/ui/button";
import type { CalibrationReport } from "../_lib/types";

/**
 * The ECE / Brier readout in the report card (AC-40/AC-41). Point estimates,
 * no CI, labelled so. A score-mode mismatch surfaces the amber copy with a
 * one-click switch to confidence — never a silent re-interpretation (AC-41).
 */
export function CalibrationReadout({ report }: { report: CalibrationReport }) {
  const updateSettings = useToolStore((s) => s.updateSettings);
  const calibration = report.calibration;

  if (calibration === null) {
    return (
      <div
        className="rounded-lg border border-surface-border bg-surface-subtle/40 p-3"
        data-testid="ece-readout"
      >
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
          ECE / Brier
        </h3>
        <p className="mt-1 text-xs text-zinc-400">
          not computable — needs a positive class (≥2 labels) and numeric scores.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-surface-border bg-surface-subtle/40 p-3"
      data-testid="ece-readout"
      data-ece={calibration.ece ?? ""}
      data-brier={calibration.brier ?? ""}
      data-score-mode={calibration.scoreMode}
    >
      <h3 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
        ECE / Brier
      </h3>
      {calibration.computable ? (
        <>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-zinc-100">
            ECE {sigFigs(calibration.ece as number)} · Brier{" "}
            {sigFigs(calibration.brier as number)}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
            point estimates, no interval · score mode <strong>{calibration.scoreMode}</strong>{" "}
            · {calibration.mode === "width" ? "equal-width" : "equal-frequency"}, {calibration.bins} bins
            · positive class &ldquo;{calibration.positiveClass}&rdquo; · {calibration.scoreCount} scored rows
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
          {calibration.reason ?? "not computable - no numeric scores"}. Add a
          <code className="mx-1 font-mono">judge_score</code> in [0,1] to unlock ECE and Brier.
        </p>
      )}

      {calibration.mismatchWarning !== null && (
        <div
          className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-brand-amber/40 bg-brand-amber/10 px-2 py-1.5"
          data-testid="calibration-mismatch"
          role="status"
        >
          <span className="text-xs text-zinc-200">{calibration.mismatchWarning}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateSettings({ judgeScoreMode: "confidence" })}
          >
            Switch to confidence
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The position / verbosity bias readout (AC-48). Every value is either computed
 * from a present column or honestly null with the missing column named — never
 * a fabricated number.
 */
export function BiasReadout({ report }: { report: CalibrationReport }) {
  const bias = report.bias;
  const position = bias.positionBias;
  const verbosity = bias.verbosityBias;

  return (
    <div
      className="rounded-lg border border-surface-border bg-surface-subtle/40 p-3"
      data-testid="bias-readout"
      data-computable={bias.computable ? "true" : "false"}
    >
      <h3 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
        Bias panel
      </h3>
      {bias.computable ? (
        <>
          <p className="mt-1 font-mono text-base font-semibold tabular-nums text-zinc-100">
            position {position === null ? "—" : sigFigs(position)} · verbosity{" "}
            {verbosity === null ? "—" : sigFigs(verbosity)}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
            position = P(first slot) − 0.5 (n={bias.positionN}) · verbosity =
            P(prefers longer) − 0.5 (n={bias.verbosityN})
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
          {bias.note}
          {bias.missingColumns.length > 0 && (
            <> needs a column: {bias.missingColumns.join(", ")}.</>
          )}
        </p>
      )}
    </div>
  );
}
