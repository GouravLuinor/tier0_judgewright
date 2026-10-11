/**
 * Judgewright — computeReport: the single source of semantics (BAR §4.2).
 *
 * The Web Worker and the synchronous main-thread fallback BOTH call this
 * function, so the two paths cannot drift. D1 computes only the point
 * statistics: the label set, the counts, the confusion matrix, the
 * binary / k-class metrics, the UNWEIGHTED Cohen's κ, the always-majority
 * chance baseline and the reproducibility receipt.
 *
 * Everything a later milestone owns (Krippendorff's α, seeded bootstrap CIs,
 * ECE/Brier, the letter grade, position/verbosity bias, the per-example
 * disagreement rows) is present as a typed `null`/empty seam — never a
 * fabricated value — and every phase runs under the cooperative deadline,
 * which may abort deferred work but never changes a point statistic.
 */

import {
  binaryMetrics,
  confusionMatrix,
  defaultPositiveClass,
  multiclassMetrics,
} from "./confusionMatrix";
import { chanceBaseline } from "./chanceBaseline";
import { cohensKappa, kappaReceiptInputs, kappaUndefinedReason } from "./cohensKappa";
import { WORKER_DEADLINE_MS } from "./constants";
import { renderReceipt } from "./reportRender";
import type {
  BiasPanel,
  CalibrationReport,
  ComputeOptions,
  RawVerdict,
} from "./types";

/** The bias panel before its milestone: honestly not computable. */
const BIAS_SEAM: BiasPanel = {
  computable: false,
  missingColumns: ["position", "preferred_longer"],
  positionBias: null,
  positionN: 0,
  verbosityBias: null,
  verbosityN: 0,
  note: "Not computable from your input — add position (0/1) and/or preferred_longer.",
};

/**
 * The D1 calibration report for one session of verdict rows.
 *
 * `rows` must already be parsed and validated (`parseVerdicts`); the row cap
 * is applied BEFORE this runs, and `options.truncated`/`options.rowCount`
 * carry the parse-derived honesty forward.
 */
export function computeReport(
  rows: readonly RawVerdict[],
  options: ComputeOptions
): CalibrationReport {
  const startedAt = Date.now();
  const deadlineMs = options.deadlineMs ?? WORKER_DEADLINE_MS;
  const engine = options.engine ?? "worker";

  const n = rows.length;
  const rowCount = options.rowCount ?? n;

  const judgeLabels: string[] = [];
  const humanLabels: string[] = [];
  for (const row of rows) {
    judgeLabels.push(row.judgeLabel);
    // The FIRST human label is the reference label; extra raters feed the
    // human-ceiling α in D2.
    humanLabels.push(row.humanLabels[0] ?? "");
  }

  // ── Phase A: confusion + metrics (always cheap, always runs) ─────────────
  const confusion = confusionMatrix(judgeLabels, humanLabels);
  const labels = confusion.labels;
  const binary = labels.length === 2;

  let agreementCells = 0;
  for (let i = 0; i < labels.length; i++) {
    agreementCells += confusion.matrix[i]?.[i] ?? 0;
  }

  const accuracy = n > 0 ? agreementCells / n : 0;
  const positiveClass =
    options.positiveClass ?? defaultPositiveClass(judgeLabels, humanLabels);

  // ── Phase B: κ + the chance baseline ────────────────────────────────────
  const kappa = cohensKappa(judgeLabels, humanLabels, "unweighted");
  const kappaReason = kappaUndefinedReason(judgeLabels, humanLabels);
  const baseline = chanceBaseline(judgeLabels, humanLabels);

  const receiptInputs = kappaReceiptInputs(judgeLabels, humanLabels);

  // The deflation is a point statistic, not a CI: safe under any deadline.
  const deflation = kappa === null ? null : accuracy - kappa;
  const liftOverBaseline = accuracy - baseline.baselineAgreement;

  // ── Deferred phases (typed seams — nothing fabricated) ──────────────────
  // D2: krippendorffAlpha() over [judge, ...humanLabels]; D2: bootstrapBundle;
  // D2: letterGrade(unweighted κ); D3: ece()/brier(); D3: biasMetrics();
  // D3: the per-example disagreement rows. The cooperative deadline is
  // checked at each phase boundary when those land.
  const elapsedMs = Date.now() - startedAt;
  const deadlineHit = elapsedMs > deadlineMs;

  const report: CalibrationReport = {
    n,
    rowCount,
    labels,
    binary,
    positiveClass: positiveClass ?? null,
    accuracy,
    rawAgreement: accuracy,
    agreementRows: agreementCells,
    confusion,
    binaryMetrics:
      binary && positiveClass !== null
        ? binaryMetrics(judgeLabels, humanLabels, positiveClass)
        : null,
    multiclass: binary ? null : multiclassMetrics(confusion),
    kappa,
    kappaLinear: null,
    kappaQuadratic: null,
    kappaUndefinedReason: kappaReason,
    alphaPanel: null,
    alphaHumans: null,
    alphaLevel: "nominal",
    alphaUndefinedReason: null,
    alphaWarning: null,
    alphaReplicates: null,
    baseline,
    deflation,
    liftOverBaseline,
    ci: { accuracy: null, kappa: null, alpha: null },
    calibration: null,
    bias: BIAS_SEAM,
    grade: "—",
    gradeLabel: "",
    disagreements: [],
    receipt: "",
    executionTimeMs: 0,
    bootstrapReplicates: 0,
    alphaBootstrapReplicates: null,
    ciDropped: false,
    engine,
    truncated: options.truncated ?? rowCount > n,
  };

  // The receipt is rendered from the settled report so the numbers it prints
  // are the numbers the UI shows (one source, never a re-derivation).
  report.receipt = renderReceipt(report, receiptInputs, {
    seed: options.seed,
    confidenceLevel: options.confidenceLevel,
    deadlineMs,
    deadlineHit,
  });
  report.executionTimeMs = Math.max(0, Date.now() - startedAt);

  return report;
}
