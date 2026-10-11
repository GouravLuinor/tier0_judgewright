/**
 * Judgewright — renderable report strings (SPEC §2.3/§2.4, AC-52/AC-60).
 *
 * The one-line verdict, the markdown report card and the reproducibility
 * receipt are PURE string builders over a settled `CalibrationReport`: no
 * clock, no IO, no rounding that the report itself would not print. Every
 * decimal is printed at 17 significant digits, and every percentage at one
 * decimal — the reviewer can recompute each one from the receipt inputs.
 *
 * D2 note: the one-line verdict carries the κ CI bracket and the letter
 * grade beside the point statistics; a CI that was dropped under the deadline
 * is named, never invented. D3 adds the ECE/Brier + bias sections to the
 * markdown card, prints the positive class in the receipt (AC-51), and the
 * agreement JSONL export (`renderAgreementJsonl`).
 */

import { bootstrapTierCopy } from "./bootstrapCI.ts";
import { KAPPA_UNDEFINED_COPY } from "./cohensKappa.ts";
import { GRADE_CONVENTION_COPY } from "./grade.ts";
import {
  ALPHA_KAPPA_BANDS_NOTE,
  ALPHA_VS_KAPPA_DISCLOSURE,
} from "./krippendorffAlpha.ts";
import { NEGATIVE_KAPPA_COPY } from "./grade.ts";
import type { CalibrationReport, ConfidenceInterval } from "./types";

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
  lines.push(`positive class: ${report.positiveClass ?? "— (single-label input)"}`);
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
  lines.push(
    `grade: ${report.grade}${report.gradeLabel ? ` (${report.gradeLabel})` : ""} — Landis–Koch bands applied to unweighted κ`
  );
  lines.push("");
  lines.push(
    `Krippendorff's α (${report.alphaLevel}) over [judge, human1, …]: ${
      report.alphaPanel === null
        ? `undefined — ${report.alphaUndefinedReason ?? "not computable"}`
        : sigFigs(report.alphaPanel)
    }`
  );
  lines.push(
    `α human ceiling (humans only): ${
      report.alphaHumans === null ? "undefined (needs ≥2 human raters)" : sigFigs(report.alphaHumans)
    }`
  );
  lines.push(`α disclosure: ${ALPHA_VS_KAPPA_DISCLOSURE}`);
  if (report.alphaWarning !== null) lines.push(`α warning: ${report.alphaWarning}`);
  lines.push("");
  lines.push(
    `weighted κ (secondary rows, 1 − D_o/D_e): linear ${
      report.kappaLinear === null ? "undefined" : sigFigs(report.kappaLinear)
    } · quadratic ${
      report.kappaQuadratic === null ? "undefined" : sigFigs(report.kappaQuadratic)
    }`
  );
  lines.push("");
  lines.push(
    `settings: seed ${String(context.seed)} · confidence ${String(context.confidenceLevel)} · deadline ${context.deadlineMs}ms${
      context.deadlineHit
        ? report.ciDropped
          ? " (reached — the bootstrap CIs were dropped; the point statistics, the chance baseline and B are unchanged)"
          : " (reached — the report settled at the budget; the intervals were still computed)"
        : ""
    }`
  );
  lines.push(
    `bootstrap: seed ${String(context.seed)} · B ${formatCount(report.bootstrapReplicates)} · ${bootstrapTierCopy(report.n)} · percentile ${(100 * (1 - context.confidenceLevel)).toFixed(2)}%/2 — ${bootstrapSummary(report)}`
  );
  lines.push(
    `ci: accuracy ${formatCi(report.ci.accuracy)} · kappa ${formatCi(report.ci.kappa)} · alpha ${formatCi(report.ci.alpha)}`
  );
  lines.push(
    `engine: ${report.engine} · ciDropped: ${report.ciDropped ? "true" : "false"} · reason: ${
      report.ciDropped
        ? "the cooperative deadline was reached before the replicates completed; B and the point statistics are unchanged"
        : "none (all replicates completed)"
    }`
  );
  lines.push(
    `no transcendentals: every value above is +, −, ×, ÷ of doubles`
  );
  return lines.join("\n");
}

/** One CI at 17 significant digits, or the reason it is absent. */
function formatCi(ci: ConfidenceInterval | null): string {
  if (ci === null) return "not computed";
  return `${sigFigs(ci.low)} – ${sigFigs(ci.high)} (point ${sigFigs(ci.point)}, ${formatCount(ci.replicates)} replicates)`;
}

/** The α replicate budget and the count the α CI actually consumed. */
function bootstrapSummary(report: CalibrationReport): string {
  if (report.alphaReplicates === null) {
    return `α replicates: not budgeted`;
  }
  return `α replicates: ${formatCount(report.alphaReplicates)} budgeted, ${
    report.alphaBootstrapReplicates === null
      ? "none consumed"
      : `${formatCount(report.alphaBootstrapReplicates)} consumed`
  }`;
}

/**
 * The one-line verdict (SPEC §2.4.3): judging-the-judge in a single line, 17
 * significant digits on κ, the κ CI bracket in the AC-55 shape, and the letter
 * grade. A κ below zero prints the systematic-disagreement copy instead of a
 * number a reviewer would misread as agreement (AC-57); a CI that was dropped
 * under the deadline is named rather than invented.
 */
export function renderOneLineVerdict(report: CalibrationReport): string {
  const accuracy = report.ci.accuracy
    ? `acc ${percent(report.rawAgreement)} [${percent(report.ci.accuracy.low)}–${percent(report.ci.accuracy.high)}]`
    : `acc ${percent(report.rawAgreement)}`;
  const kappa =
    report.kappa === null
      ? `κ undefined (no label variance to correct for)`
      : report.kappa < 0
        ? `κ ${sigFigs(report.kappa)} — ${NEGATIVE_KAPPA_COPY}`
        : report.ci.kappa
          ? `κ ${sigFigs(report.kappa)} [${sigFigs(report.ci.kappa.low)}, ${sigFigs(report.ci.kappa.high)}]`
          : `κ ${sigFigs(report.kappa)} (no CI — deadline reached)`;
  const grade = report.kappa === null ? "" : ` · grade ${report.grade}`;
  const baseline = `always-majority ${percent(report.baseline.baselineAgreement)}`;
  return `Human agreement: ${formatCount(report.n)} rows · ${accuracy} · ${kappa}${grade} · ${baseline}`;
}

/**
 * The agreement export as JSONL (AC-50 / AC-28): one line per row with
 * `{example_id, judge_label, human_label, agree}`. The fields are format-derived
 * and stable, so a JSONL input and the identical CSV input produce byte-equal
 * exports — the export proves the two formats settled the same report.
 */
export function renderAgreementJsonl(report: CalibrationReport): string {
  return report.disagreements
    .map((row) =>
      JSON.stringify({
        example_id: row.exampleId,
        judge_label: row.judgeLabel,
        human_label: row.humanLabel,
        agree: row.agree,
      })
    )
    .join("\n");
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
  lines.push(`RAW AGREEMENT (accuracy): ${percent(report.rawAgreement)}${ciBracket(report.ci.accuracy)}`);
  if (report.kappa === null) {
    lines.push(`UNWEIGHTED κ: undefined — ${KAPPA_UNDEFINED_COPY}`);
  } else if (report.kappa < 0) {
    lines.push(`UNWEIGHTED κ (chance-corrected): ${sigFigs(report.kappa)}${ciBracket(report.ci.kappa)}`);
    lines.push(NEGATIVE_KAPPA_COPY);
  } else {
    lines.push(`UNWEIGHTED κ (chance-corrected): ${sigFigs(report.kappa)}${ciBracket(report.ci.kappa)}`);
    if (report.deflation !== null) {
      lines.push(
        `Δκ deflation: ${sigFigs(report.deflation)} (raw agreement overstates chance-corrected agreement by ${(report.deflation * 100).toFixed(1)} pp)`
      );
    }
  }
  lines.push(
    `CHANCE BASELINE (always-majority on this label distribution): ${percent(report.baseline.baselineAgreement)}`
  );
  if (report.kappa !== null) {
    lines.push(`LETTER GRADE: ${report.grade} — ${report.gradeLabel} (${GRADE_CONVENTION_COPY})`);
  }
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

  if (report.kappaLinear !== null || report.kappaQuadratic !== null) {
    lines.push("Weighted κ (secondary rows, 1 − D_o/D_e over sorted label ranks):");
    lines.push(
      `- linear ${
        report.kappaLinear === null ? "undefined" : sigFigs(report.kappaLinear)
      } · quadratic ${
        report.kappaQuadratic === null ? "undefined" : sigFigs(report.kappaQuadratic)
      } — these are secondary rows only; the headline, the grade and every CI stay on the unweighted κ`
    );
    lines.push("");
  }

  lines.push(
    `Krippendorff's α (${report.alphaLevel}) — panel [judge, human1, …]: ${
      report.alphaPanel === null
        ? `undefined — ${report.alphaUndefinedReason ?? "not computable"}`
        : sigFigs(report.alphaPanel)
    }${report.ci.alpha ? ` [${sigFigs(report.ci.alpha.low)}, ${sigFigs(report.ci.alpha.high)}]` : ""} · human ceiling: ${
      report.alphaHumans === null ? "undefined (needs ≥2 human raters)" : sigFigs(report.alphaHumans)
    }`
  );
  lines.push(`α disclosure: ${ALPHA_VS_KAPPA_DISCLOSURE}`);
  if (report.alphaWarning !== null) {
    lines.push(`α warning: ${report.alphaWarning}`);
  }
  lines.push(`grade on α: ${ALPHA_KAPPA_BANDS_NOTE}`);
  lines.push("");

  const calibration = report.calibration;
  if (calibration !== null) {
    const scheme =
      calibration.mode === "width" ? "equal-width" : "equal-frequency";
    lines.push(
      `ECE / Brier (point estimates, no CI — score mode: ${calibration.scoreMode} · ${scheme}, ${calibration.bins} bins · positive class "${calibration.positiveClass}"):`
    );
    if (calibration.computable) {
      lines.push(
        `- ECE ${calibration.ece === null ? "—" : sigFigs(calibration.ece)} · Brier ${calibration.brier === null ? "—" : sigFigs(calibration.brier)} — over ${formatCount(calibration.scoreCount)} scored rows`
      );
    } else {
      lines.push(
        `- ${calibration.reason ?? "not computable - no numeric scores"}`
      );
    }
    if (calibration.mismatchWarning !== null) {
      lines.push(`MODE MISMATCH: ${calibration.mismatchWarning}`);
    }
    lines.push("");
  }

  lines.push("Bias panel (position / verbosity):");
  if (report.bias.computable) {
    const pb =
      report.bias.positionBias === null
        ? "—"
        : sigFigs(report.bias.positionBias);
    const vb =
      report.bias.verbosityBias === null
        ? "—"
        : sigFigs(report.bias.verbosityBias);
    lines.push(
      `- position bias ${pb} (P(first slot) − 0.5, n=${formatCount(report.bias.positionN)}) · verbosity bias ${vb} (P(prefers longer) − 0.5, n=${formatCount(report.bias.verbosityN)})`
    );
    lines.push(`- ${report.bias.note}`);
  } else {
    lines.push(`- ${report.bias.note}`);
    if (report.bias.missingColumns.length > 0) {
      lines.push(`- needs: ${report.bias.missingColumns.join(", ")}`);
    }
  }
  lines.push("");

  const shown = report.disagreements.length;
  const disagreements = report.disagreements.filter((row) => !row.agree);
  lines.push(
    `Disagreements: ${formatCount(disagreements.length)} of ${formatCount(report.n)} rows disagree (showing ${formatCount(shown)} of ${formatCount(report.n)})`
  );
  lines.push("");

  lines.push(report.receipt);
  lines.push("");
  lines.push(
    "ECE/Brier and the bias metrics are point estimates and carry no interval; a not-computable panel names what it needs. The optional LLM diagnosis is a separate single-call opt-in (one click, one key, never automatic) and is never folded into this card."
  );
  return lines.join("\n");
}

/** A CI bracket for inline use, or an empty string when there is no CI. */
function ciBracket(ci: ConfidenceInterval | null): string {
  if (ci === null) return "";
  return ` [${sigFigs(ci.low)}, ${sigFigs(ci.high)}]`;
}

