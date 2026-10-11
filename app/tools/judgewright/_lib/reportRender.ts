/**
 * Judgewright — renderable report strings (SPEC §2.3/§2.4, AC-52/AC-60).
 *
 * The one-line verdict, the markdown report card and the reproducibility
 * receipt are PURE string builders over a settled `CalibrationReport`: no
 * clock, no IO, no rounding that the report itself would not print. Every
 * decimal is printed at 17 significant digits, and every percentage at one
 * decimal — the reviewer can recompute each one from the receipt inputs.
 *
 * D1 note: the canonical one-line golden of AC-55 (with the CI bracket)
 * lands with the M2 bootstrap; the D1 string carries the point statistics
 * only, never a fabricated interval.
 */

import type { CalibrationReport } from "./types";
import { KAPPA_UNDEFINED_COPY } from "./cohensKappa";

/** The integer-rational receipt inputs, recomputed by hand by a reviewer. */
export interface KappaReceiptInputs {
  n: number;
  a: number;
  s: number;
  numerator: number;
  denominator: number;
}

export interface ReceiptContext {
  seed: number;
  confidenceLevel: number;
  deadlineMs: number;
  deadlineHit: boolean;
}

/** 17 significant digits — the byte-reproducible precision of AC-13/AC-55. */
export function sigFigs(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return String(value);
  return value.toPrecision(17);
}

/** One-decimal percentage for headline figures. */
export function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * The reproducibility receipt: the exact formula, the exact inputs and the
 * arithmetic in between, so a reviewer can recompute κ from the 2×2 (or the
 * k×k) alone (AC-52 / SPEC §2.4.4).
 */
export function renderReceipt(
  report: CalibrationReport,
  inputs: KappaReceiptInputs | null,
  context: ReceiptContext
): string {
  const lines: string[] = [];
  lines.push("REPRODUCIBILITY RECEIPT — Judgewright calibration report");
  lines.push(`engine: ${report.engine} · rows analyzed: ${formatCount(report.n)}`);
  lines.push("");

  if (report.kappa === null || inputs === null) {
    lines.push(`κ: undefined — ${KAPPA_UNDEFINED_COPY}`);
  } else {
    lines.push(
      `κ = (A·n − S) / (n² − S)   [unweighted Cohen's κ, integer-rational fast form]`
    );
    lines.push(`labels (sorted ascending): ${report.labels.join(", ")}`);
    lines.push(
      `confusion matrix — rows = human, cols = judge (cell count / row total):`
    );
    const header = ["human\\judge", ...report.labels].join("\t");
    lines.push(header);
    report.confusion.matrix.forEach((row, h) => {
      const cells = row.join("\t");
      lines.push(
        `${report.labels[h] ?? "?"}\t${cells}\t${report.confusion.rowTotals[h] ?? 0}`
      );
    });
    lines.push(`colTotals\t${report.confusion.colTotals.join("\t")}`);
    lines.push("");
    lines.push(`n = ${inputs.n}`);
    lines.push(
      `A = ${inputs.a}  (Σᵢ O_ii — the diagonal agreement cells)`
    );
    lines.push(
      `S = ${inputs.s}  (Σᵢ rowᵢ·colᵢ — the chance expectation, unscaled)`
    );
    lines.push(
      `A·n − S = ${inputs.numerator}   n² − S = ${inputs.denominator}`
    );
    lines.push(
      `κ = ${inputs.numerator}/${inputs.denominator} = ${sigFigs(report.kappa)}`
    );
  }
  lines.push("");
  lines.push(
    `raw agreement = ${report.agreementRows}/${report.n} = ${sigFigs(report.rawAgreement)}`
  );
  lines.push(
    `chance baseline (always-majority on the human label distribution) = ${percent(report.baseline.baselineAgreement)} — majority class "${report.baseline.majorityClass}"`
  );
  lines.push(
    `baseline κ ≡ 0 by the p_o = p_e identity (never routed through cohensKappa, which refuses constant raters)`
  );
  if (report.deflation !== null) {
    lines.push(
      `Δκ (deflation) = raw agreement − κ = ${sigFigs(report.deflation)}`
    );
  }
  lines.push("");
  lines.push(
    `settings: seed ${String(context.seed)} · confidence ${String(context.confidenceLevel)} · deadline ${context.deadlineMs}ms${context.deadlineHit ? " (reached — deferred phases aborted; point statistics unchanged)" : ""}`
  );
  lines.push(
    `bootstrap CIs: not computed in this build (the M2 milestone lands seeded, reproducible intervals)`
  );
  lines.push(
    `no transcendentals: every value above is +, −, ×, ÷ of doubles`
  );
  return lines.join("\n");
}

/**
 * The one-line verdict (SPEC §2.4.3): judging-the-judge in a single line,
 * 17 significant digits on κ. D1 carries the point statistics only — the CI
 * bracket of the AC-55 golden lands with the bootstrap milestone.
 */
export function renderOneLineVerdict(report: CalibrationReport): string {
  const accuracy = `acc ${percent(report.rawAgreement)}`;
  const kappa =
    report.kappa === null
      ? `κ undefined (no label variance to correct for)`
      : `κ ${sigFigs(report.kappa)}`;
  const baseline = `always-majority ${percent(report.baseline.baselineAgreement)}`;
  return `Human agreement: ${formatCount(report.n)} rows · ${accuracy} · ${kappa} · ${baseline}`;
}

/**
 * The markdown report card the Copy button ships: headline figures, the
 * deflation, the binary metrics, the k-class table and the receipt.
 */
export function renderMarkdownReport(report: CalibrationReport): string {
  const lines: string[] = [];
  lines.push("# Judgewright — calibration report card");
  lines.push("");
  lines.push(
    `n = ${formatCount(report.n)} rows · labels: ${report.labels.join(", ")}${report.binary ? " (binary)" : ""}`
  );
  lines.push(`positive class: ${report.positiveClass ?? "—"}`);
  lines.push("");
  lines.push(`RAW AGREEMENT (accuracy): ${percent(report.rawAgreement)}`);
  if (report.kappa === null) {
    lines.push(`UNWEIGHTED κ: undefined — ${KAPPA_UNDEFINED_COPY}`);
  } else {
    lines.push(`UNWEIGHTED κ (chance-corrected): ${sigFigs(report.kappa)}`);
    if (report.deflation !== null) {
      lines.push(
        `Δκ deflation: ${sigFigs(report.deflation)} (raw agreement overstates chance-corrected agreement by ${(report.deflation * 100).toFixed(1)} pp)`
      );
    }
  }
  lines.push(
    `CHANCE BASELINE (always-majority on this label distribution): ${percent(report.baseline.baselineAgreement)}`
  );
  lines.push("");

  const labels = report.confusion.labels;
  lines.push("Confusion matrix (human rows × judge cols):");
  lines.push(`| human \\ judge | ${labels.join(" | ")} | total |`);
  lines.push(`| ${labels.map(() => "---").join(" | ")} | --- |`);
  report.confusion.matrix.forEach((row, h) => {
    lines.push(
      `| ${labels[h] ?? "?"} | ${row.join(" | ")} | ${report.confusion.rowTotals[h] ?? 0} |`
    );
  });
  lines.push(
    `| total | ${report.confusion.colTotals.join(" | ")} | ${report.n} |`
  );
  lines.push("");

  if (report.binaryMetrics !== null) {
    const m = report.binaryMetrics;
    lines.push(
      `Binary metrics (positive class "${m.positiveClass}"): TP ${m.tp} · FP ${m.fp} · TN ${m.tn} · FN ${m.fn}`
    );
    const rate = (value: number | null) => (value === null ? "—" : sigFigs(value));
    lines.push(
      `TPR ${rate(m.tpr)} · TNR ${rate(m.tnr)} · PPV ${rate(m.ppv)} · FPR ${rate(m.fpr)} · F1 ${rate(m.f1)}`
    );
    lines.push("");
  }

  if (report.multiclass !== null) {
    lines.push("Per-label metrics:");
    for (const entry of report.multiclass.perLabel) {
      const rate = (value: number | null) => (value === null ? "—" : sigFigs(value));
      lines.push(
        `- ${entry.label}: precision ${rate(entry.precision)} · recall ${rate(entry.recall)} · F1 ${rate(entry.f1)} · support ${entry.support}`
      );
    }
    lines.push("");
  }

  lines.push(report.receipt);
  lines.push("");
  lines.push(
    "Krippendorff's α · bootstrap CIs · letter grade · ECE/Brier · bias panel · disagreement table: later milestones — typed seams, no fabricated values."
  );
  return lines.join("\n");
}
