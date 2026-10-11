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
import { biasMetrics } from "./biasMetrics.ts";
import { calibrationPanel } from "./calibration.ts";
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
  CalibrationReport,
  ComputeOptions,
  RawVerdict,
} from "./types";

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
  // AC-51: the positive class defaults to the second sorted label and is
  // user-overridable. A STALE override (not among this session's labels) falls
  // back to the default rather than echoing a binary-metric null.
  const requestedPositive = options.positiveClass ?? null;
  const positiveClass =
    requestedPositive !== null && labels.includes(requestedPositive)
      ? requestedPositive
      : defaultPositiveClass(judgeLabels, humanLabels);

  // D3 (AC-40): the score-mode semantics + ECE binning. Defaults here so the
  // pure seam and the worker both resolve them identically.
  const judgeScoreMode = options.judgeScoreMode ?? "p-positive";
  const bins =
    Number.isFinite(options.bins) && (options.bins ?? 10) >= 1
      ? Math.floor(options.bins as number)
      : 10;
  const binMode = options.binMode ?? "width";

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
  // budget is an ABSOLUTE timestamp. A2: `analyzeVerdicts` supplies one taken
  // BEFORE the parse, so the budget covers the whole pipeline; without it the
  // budget starts here.
  const bootstrapReplicates = bootstrapTier(n);
  const deadlineAt = options.deadlineAt ?? startedAt + deadlineMs;
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
  } else if (panel !== null) {
    // A2: the budget was already spent (typically by a large parse). The
    // report STILL settles — the point statistics above are untouched — and
    // the dropped CIs are named rather than left silently absent with
    // `ciDropped: false`.
    ciDropped = true;
  }

  // ── Settlement ───────────────────────────────────────────────────────────
  // A2: the budget boundary is the ABSOLUTE deadline (parse included), so the
  // receipt names a trip even when the parse consumed the whole budget.
  const deadlineHit = Date.now() > deadlineAt;

  const report: CalibrationReport = {
    n,
    rowCount,
    labels,
    binary,
    positiveClass: positiveClass ?? null,
    accuracy,
    rawAgreement: accuracy,
    agreementRows: agreementCells,
    // A3: the TRUE totals over the FULL analyzed set — never the display
    // cap. The store, the export and the card print these so a capped
    // count can never masquerade as the total.
    agreementTotal: agreementCells,
    disagreementTotal: n - agreementCells,
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
    calibration: calibrationPanel(rows, {
      positiveClass,
      judgeScoreMode,
      bins,
      binMode,
    }),
    bias: biasMetrics(rows),
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

