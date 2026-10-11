/**
 * Judgewright — Calibration metrics: ECE + Brier (SPEC §2.1.5, AC-40/41,
 * AC-11/12, D3).
 *
 * Two POINT ESTIMATES of calibration, computed with NOTHING but +, −, ×, ÷ and
 * `Math.floor/min/max/abs` (AC-60 — no transcendentals; the reliability curve
 * never needs a log, and neither does the expected-vs-observed gap). They
 * compare a predicted probability `p` against a 0/1 outcome `y` where both
 * refer to the SAME event — "the reference (human) label is the positive
 * class" — so `(p, y)` is a well-formed calibration pair and `(p − y)²` is a
 * proper squared error.
 *
 * THE TWO SCORE MODES (AC-40 / SPEC §2.1.5) resolve `p` from the judge score
 * differently, always against a chosen positive class:
 *   · `p-positive`: the judge_score IS p = P(reference is positive); p = s.
 *   · `confidence`: the judge_score is the confidence in the judge's OWN
 *     emitted label, so p flips on rows the judge labelled NEGATIVE —
 *     p = s when judgeLabel === positiveClass, else p = 1 − s.
 * The report resolves the per-row p and passes the resolved array + the
 * outcome array here; `calibrationPanel` owns that resolution so the two modes
 * are observable on the SAME rows (AC-40).
 *
 * OUT-OF-RANGE / NON-NUMERIC scores (AC-37) are treated as ABSENT, never
 * clamped: the parser already nulls a non-`[0,1]` judge_score with a
 * line-numbered issue, so this module receives a clean 0/1 or `null`. When no
 * row carries a usable score the calibration value is `null` + a reason — never
 * a fabricated 0 (FM-3).
 */

import type {
  BinMode,
  CalibrationPanel,
  RawVerdict,
  JudgeScoreMode,
} from "./types.ts";

/** AC-41 verbatim substring this panel must surface on a mode mismatch. */
export const CALIBRATION_MISMATCH_COPY =
  "your scores look like confidences, not probabilities — consider switching the score mode to confidence";

/**
 * AC-41/C2 threshold: when the two modes disagree on ECE by more than this the
 * scores are ambiguous and the panel says so rather than silently choosing.
 */
export const CALIBRATION_MISMATCH_THRESHOLD = 0.05;

/** FM-3: the honest reason when no numeric scores are present. */
export const CALIBRATION_NOT_COMPUTABLE_REASON = "not computable — no numeric scores";

/** A judge_score is usable only as a finite probability in `[0, 1]`. */
function usableScore(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** The bin index for an equal-width partition — one multiply and one floor. */
function widthBin(p: number, bins: number): number {
  let idx = Math.floor(p * bins);
  if (idx < 0) idx = 0;
  if (idx >= bins) idx = bins - 1;
  return idx;
}

/**
 * Expected Calibration Error (equal-width or equal-frequency), NO
 * transcendentals:
 *
 *     ECE = Σ_bins (n_b / n) · |acc_b − conf_b|
 *
 * where `conf_b` is the mean predicted probability in the bin and `acc_b` the
 * fraction of positive outcomes. Equal-frequency partitions the sorted scores
 * into `bins` groups of equal count (quantile-thresholded at the sorted
 * boundaries — pure integer index arithmetic). Empty bins carry no weight.
 *
 * Returns `null` when no score is usable. It is a POINT ESTIMATE — no CI.
 */
export function ece(
  scores: Float64Array,
  correct: readonly number[],
  bins = 10,
  mode: BinMode = "width"
): number | null {
  if (!Number.isFinite(bins) || bins < 1) return null;
  const binCount = Math.floor(bins);
  if (binCount < 1) return null;

  // Resolve the usable (p, y) pairs once — out-of-range entries are skipped,
  // never clamped.
  const pValid: number[] = [];
  const yValid: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    const p = scores[i] as number;
    if (!usableScore(p)) continue;
    pValid.push(p);
    yValid.push(correct[i] === 1 ? 1 : 0);
  }
  const m = pValid.length;
  if (m === 0) return null;

  const binSumP = new Float64Array(binCount);
  const binSumY = new Int32Array(binCount);
  const binTotal = new Int32Array(binCount);

  if (mode === "freq") {
    // Equal-frequency: sort the usable indices by p, then slice into `binCount`
    // contiguous equal count groups. Boundary[k] = floor(k·m / binCount).
    const order = new Array<number>(m);
    for (let i = 0; i < m; i++) order[i] = i;
    order.sort((a, b) => pValid[a]! - pValid[b]!);
    for (let k = 0; k < binCount; k++) {
      const lo = Math.floor((k * m) / binCount);
      const hi = Math.floor(((k + 1) * m) / binCount);
      if (hi <= lo) continue;
      for (let j = lo; j < hi; j++) {
        const idx = order[j]!;
        const p = pValid[idx]!;
        binSumP[k] += p;
        binSumY[k] += yValid[idx]!;
        binTotal[k] += 1;
      }
    }
  } else {
    for (let i = 0; i < m; i++) {
      const p = pValid[i]!;
      const idx = widthBin(p, binCount);
      binSumP[idx] += p;
      binSumY[idx] += yValid[i]!;
      binTotal[idx] += 1;
    }
  }

  let total = 0;
  for (let k = 0; k < binCount; k++) {
    const c = binTotal[k]!;
    if (c === 0) continue;
    const conf = binSumP[k]! / c;
    const acc = binSumY[k]! / c;
    const diff = acc - conf;
    total += (c / m) * (diff < 0 ? -diff : diff);
  }
  return total;
}

/**
 * Brier score (binary, against the positive class):
 *
 *     Brier = (1 / n) Σᵢ (pᵢ − yᵢ)²
 *
 * A single mean of squared error — binning-independent, so `mode` is accepted
 * for signature parity with `ece` and ignored. `null` when no score is usable.
 * A POINT ESTIMATE — no CI.
 */
export function brier(
  scores: Float64Array,
  correct: readonly number[],
  _mode: BinMode = "width"
): number | null {
  let sum = 0;
  let m = 0;
  for (let i = 0; i < scores.length; i++) {
    const p = scores[i] as number;
    if (!usableScore(p)) continue;
    const y = correct[i] === 1 ? 1 : 0;
    const diff = p - y;
    sum += diff * diff;
    m += 1;
  }
  if (m === 0) return null;
  return sum / m;
}

export interface CalibrationResolveOptions {
  /** The positive class; `null` means the input has no positive class yet. */
  positiveClass: string | null;
  /** Which score semantics to resolve the per-row positive probability with. */
  judgeScoreMode: JudgeScoreMode;
  /** Bin count for ECE (equal-width default 10). */
  bins: number;
  /** Binning scheme for ECE. */
  binMode: BinMode;
}

/**
 * The settled calibration panel. Resolves the per-row positive probability in
 * BOTH modes (so `ece` sees the resolved array and the mode mismatch stays
 * observable), computes ECE + Brier as point estimates, and discloses the
 * selected mode + positive class. A usable-score-free panel is not computable:
 * `ece`/`brier` are `null` with a reason, never 0 (FM-3). `positiveClass` null
 * ⇒ the panel itself is `null` (no positive class to calibrate against).
 */
export function calibrationPanel(
  rows: readonly RawVerdict[],
  options: CalibrationResolveOptions
): CalibrationPanel | null {
  const { positiveClass, judgeScoreMode, bins, binMode } = options;
  if (positiveClass === null) return null;

  // Resolve both modes against the same outcome so the mismatch detector can
  // compare them without recomputing resolution a second time.
  const scoresPpositive: number[] = [];
  const scoresConfidence: number[] = [];
  const outcomes: number[] = [];
  for (const row of rows) {
    const s = row.judgeScore;
    if (!usableScore(s)) continue; // absent / out-of-range ⇒ treated absent
    outcomes.push(row.humanLabels[0] === positiveClass ? 1 : 0);
    scoresPpositive.push(s);
    scoresConfidence.push(row.judgeLabel === positiveClass ? s : 1 - s);
  }

  const scoreCount = outcomes.length;
  const selected =
    judgeScoreMode === "confidence" ? scoresConfidence : scoresPpositive;

  const eceValue =
    scoreCount > 0
      ? ece(Float64Array.from(selected), outcomes, bins, binMode)
      : null;
  const brierValue =
    scoreCount > 0
      ? brier(Float64Array.from(selected), outcomes, binMode)
      : null;

  // AC-41/C2: the modes are observable. When the DEFAULT (p-positive) is
  // selected but the scores behave like confidences (ECE gap > 0.05), surface
  // the amber hint rather than silently choosing a mode.
  let mismatchWarning: string | null = null;
  if (scoreCount > 0 && judgeScoreMode === "p-positive") {
    const ecePpositive = ece(
      Float64Array.from(scoresPpositive),
      outcomes,
      bins,
      binMode
    );
    const eceConfidence = ece(
      Float64Array.from(scoresConfidence),
      outcomes,
      bins,
      binMode
    );
    if (ecePpositive !== null && eceConfidence !== null) {
      const diff = ecePpositive - eceConfidence;
      const magnitude = diff < 0 ? -diff : diff;
      if (magnitude > CALIBRATION_MISMATCH_THRESHOLD) {
        mismatchWarning = CALIBRATION_MISMATCH_COPY;
      }
    }
  }

  return {
    ece: eceValue,
    brier: brierValue,
    bins,
    mode: binMode,
    scoreMode: judgeScoreMode,
    positiveClass,
    mismatchWarning,
    ambiguousReason: null,
    reason: scoreCount > 0 ? null : CALIBRATION_NOT_COMPUTABLE_REASON,
    scoreCount,
    computable: scoreCount > 0,
  };
}
