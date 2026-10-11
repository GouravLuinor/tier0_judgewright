/**
 * Judgewright — computeReport: the single source of semantics (BAR §4.2).
 *
 * The Web Worker and the synchronous main-thread fallback BOTH call this
 * function, so the two paths cannot drift. Phase A (confusion, metrics,
 * unweighted κ, baseline, α, weighted κ, grade, deflation, the disagreement
 * rows) is always cheap and always runs. Phase B — the seeded bootstrap CIs —
 * runs only while the cooperative budget remains, and may be aborted, but an
 * abort can never change a point statistic, the reported B or a baseline
 * (AGENTS §31).
 *
 * Every field a milestone owns is filled by that milestone's module: α and the
 * weighted secondary rows came in D2 (`krippendorffAlpha.ts`,
 * `cohensKappa.ts`), the CIs, the grade and the Δκ headline too; ECE/Brier and
 * the position/verbosity bias panel stay typed seams for D3.
 */

import {
  alphaBootstrapTier,
  bootstrapBundle,
  bootstrapTier,
  encodePanel,
} from "./bootstrapCI.ts";
import { chanceBaseline } from "./chanceBaseline.ts";
import {
  binaryMetrics,
  confusionMatrix,
  defaultPositiveClass,
  multiclassMetrics,
} from "./confusionMatrix";
import { cohensKappa, kappaReceiptInputs, kappaUndefinedReason } from "./cohensKappa";
import { MAX_TABLE_ROWS, WORKER_DEADLINE_MS } from "./constants";
import { buildDisagreementRows } from "./disagreements.ts";
import { landisKochLabel, letterGrade } from "./grade.ts";
import { alphaReplicateContext, krippendorffAlpha } from "./krippendorffAlpha.ts";
import { renderReceipt } from "./reportRender";
import type {
  AlphaLevel,
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
 * The D2 calibration report for one session of verdict rows.
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
  const alphaLevel: AlphaLevel = options.alphaLevel ?? "nominal";

  const n = rows.length;
  const rowCount = options.rowCount ?? n;

  const judgeLabels: string[] = [];
  const humanLabels: string[] = [];
  for (const row of rows) {
    judgeLabels.push(row.judgeLabel);
    // The FIRST human label is the reference label; extra raters feed the
    // human-ceiling α only.
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

  // ── Phase A2: κ (unweighted headline + weighted secondary rows) ───────────
  const kappa = cohensKappa(judgeLabels, humanLabels, "unweighted");
  const kappaReason = kappaUndefinedReason(judgeLabels, humanLabels);
  const baseline = chanceBaseline(judgeLabels, humanLabels);
  const receiptInputs = kappaReceiptInputs(judgeLabels, humanLabels);

  // The weighted rows share the single degenerate guard; they are labelled
  // secondary and never reach the headline, the grade or the deflation.
  const kappaLinear = kappaReason === null ? cohensKappa(judgeLabels, humanLabels, "linear") : null;
  const kappaQuadratic =
    kappaReason === null ? cohensKappa(judgeLabels, humanLabels, "quadratic") : null;


  // The deflation is a point statistic, not a CI: safe under any deadline.
  const deflation = kappa === null ? null : accuracy - kappa;
  const liftOverBaseline = accuracy - baseline.baselineAgreement;

  // ── Phase A3: Krippendorff's α (panel + human ceiling) ────────────────────
  const alphaPanelUnits: string[][] = rows.map((row) => [row.judgeLabel, ...row.humanLabels]);
  const alphaPanelResult = krippendorffAlpha(alphaPanelUnits, alphaLevel, options.labelOrder);

  // The ceiling drops the judge. It needs ≥2 human raters per example, so the
  // widest human panel decides: one human rater ⇒ null + the rendered
  // disclosure, never a guess (AC-34).
  let widestHumanCount = 0;
  for (const row of rows) {
    if (row.humanLabels.length > widestHumanCount) widestHumanCount = row.humanLabels.length;
  }
  const alphaHumansResult =
    widestHumanCount >= 2
      ? krippendorffAlpha(
          rows.map((row) => row.humanLabels),
          alphaLevel,
          options.labelOrder
        )
      : { value: null, reason: null, warning: null };

  const alphaPanel = alphaPanelResult.value;
  const alphaHumans = alphaHumansResult.value;
  const alphaUndefinedReason = alphaPanelResult.reason ?? alphaHumansResult.reason ?? null;
  const alphaWarning = alphaPanelResult.warning ?? alphaHumansResult.warning ?? null;

  // ── Phase A4: grade + the per-example rows ───────────────────────────────
  const grade = letterGrade(kappa);
  const gradeLabel = landisKochLabel(kappa);
  const disagreements = buildDisagreementRows(rows);

  // ── Phase B: seeded bootstrap CIs (deadline-gated) ───────────────────────
  // B is a pure function of the row count; the seed comes from settings. The
  // budget is an ABSOLUTE timestamp (`startedAt + deadlineMs`), the same
  // convention every phase boundary uses.
  const bootstrapReplicates = bootstrapTier(n);
  const deadlineAt = startedAt + deadlineMs;
  const panel =
    n >= 2 && labels.length >= 2 ? encodePanel(judgeLabels, humanLabels) : null;
  const alphaCtx =
    panel === null ? null : alphaReplicateContext(labels, alphaLevel, options.labelOrder);
  const alphaBudget =
    alphaCtx === null ? null : alphaBootstrapTier(n, bootstrapReplicates);

  let ci: CalibrationReport["ci"] = { accuracy: null, kappa: null, alpha: null };
  let ciDropped = false;

  if (panel !== null && Date.now() <= deadlineAt) {
    const bundle = bootstrapBundle(panel, {
      seed: options.seed,
      B: bootstrapReplicates,
      alphaB: alphaBudget ?? undefined,
      alpha: 1 - options.confidenceLevel,
      alphaLevel,
      alphaOrder: options.labelOrder,
      deadlineAt,
    });
    ci = { accuracy: bundle.accuracy, kappa: bundle.kappa, alpha: bundle.alpha };
    ciDropped = bundle.deadlineHit;
  }

  // ── Settlement ───────────────────────────────────────────────────────────
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
    kappaLinear,
    kappaQuadratic,
    kappaUndefinedReason: kappaReason,
    alphaPanel,
    alphaHumans,
    alphaLevel,
    alphaUndefinedReason,
    alphaWarning,
    // The α replicate budget the tier rule applied ("actually used" for the
    // report, and the count the α CI really consumed, ride in
    // `alphaBootstrapReplicates`).
    alphaReplicates: alphaBudget,
    baseline,
    deflation,
    liftOverBaseline,
    ci,
    calibration: null,
    bias: BIAS_SEAM,
    grade,
    gradeLabel,
    disagreements,
    receipt: "",
    executionTimeMs: 0,
    bootstrapReplicates,
    alphaBootstrapReplicates: ci.alpha?.replicates ?? null,
    ciDropped,
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

/** The one display window the worker payload ships (AC-16/AC-59 seam). */
export function reportDisagreementWindow(
  report: CalibrationReport,
  offset = 0,
  limit: number = MAX_TABLE_ROWS
): CalibrationReport {
  return {
    ...report,
    disagreements: report.disagreements.slice(
      Math.max(0, Math.floor(offset)),
      Math.max(0, Math.floor(offset)) + Math.max(1, Math.floor(limit))
    ),
  };
}

