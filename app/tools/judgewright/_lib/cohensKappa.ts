/**
 * Judgewright — Cohen's κ (SPEC §2.2, AC-01…AC-05, AC-42).
 *
 * One arithmetic path for the headline: the INTEGER-RATIONAL fast form
 *
 *     κ = (A·n − S) / (n² − S)
 *
 * where `A = Σᵢ O_ii` (the agreement cells) and `S = Σᵢ rowᵢ·colᵢ` are exact
 * integer sums, and `n` is the row count. This is algebraically identical to
 * `1 − D_o/D_e` but never accumulates float summation drift, so the canonical
 * examples land on the nearest double bit-for-bit (scikit-learn parity to
 * ±1e-12; the PLAN §1.1 reference table).
 *
 * THE SINGLE GUARD RUNS FIRST (AC-42): when either rater used fewer than two
 * distinct labels the function returns `null` — which is exactly the
 * `S === n²` one-label-per-rater case the fast form cannot divide around
 * (`0/0 = NaN`), and the one-rater-constant case where `p_o ≡ p_e` by
 * construction so the value would carry no information about the judge.
 *
 * `weights` selects the DISAGREEMENT-WEIGHT form `1 − D_o/D_e` with
 * `w_ii = 0`, `w_ij = |i−j|` (linear) or `|i−j|²` (quadratic). The weighted
 * rows are a D2 deliverable and a labelled secondary row only — they never
 * feed the headline, the grade, the deflation or the CI. The unweighted case
 * always takes the integer fast path.
 */

import { confusionMatrix } from "./confusionMatrix";
import type { KappaWeights } from "./types";

/** The κ headline copy for the degenerate guard (FM-4). */
export const KAPPA_UNDEFINED_COPY =
  "κ is undefined: no label variance to correct for. Report accuracy instead.";

/**
 * The single degenerate guard: null + reason when either rater is constant.
 * Runs BEFORE either arithmetic path.
 */
export function kappaUndefinedReason(
  judge: readonly string[],
  human: readonly string[]
): string | null {
  if (new Set(judge).size < 2 || new Set(human).size < 2) {
    return KAPPA_UNDEFINED_COPY;
  }
  return null;
}

/** Distinct labels a rater actually used. */
function distinctCount(values: readonly string[]): number {
  return new Set(values).size;
}

/**
 * Cohen's κ, unweighted by default.
 *
 * @param weights "unweighted" | "linear" | "quadratic" — only "unweighted" is
 *                implemented in D1; the weighted rows land in D2.
 * @returns κ, or `null` when the degenerate guard fires (never NaN, never 1).
 */
export function cohensKappa(
  judge: readonly string[],
  human: readonly string[],
  weights: KappaWeights = "unweighted"
): number | null {
  // The guard is deliberately the FIRST statement: no arithmetic runs on a
  // degenerate pair, so no NaN or fabricated 1 can ever escape.
  if (distinctCount(judge) < 2 || distinctCount(human) < 2) return null;

  const n = Math.min(judge.length, human.length);
  if (n === 0) return null;

  if (weights !== "unweighted") {
    // D2 seam: the disagreement-weight form. Declining with null (never a
    // silently wrong number) keeps the secondary rows honest until they land.
    return null;
  }

  const { labels, matrix, rowTotals, colTotals } = confusionMatrix(judge, human);

  // Exact integer sums — the fast path's whole point.
  let a = 0; // Σᵢ O_ii (diagonal agreement)
  let s = 0; // Σᵢ rowᵢ·colᵢ (chance agreement expectation, unscaled)
  for (let i = 0; i < labels.length; i++) {
    const roww = rowTotals[i] ?? 0;
    const coll = colTotals[i] ?? 0;
    a += matrix[i]?.[i] ?? 0;
    s += roww * coll;
  }

  const denominator = n * n - s;
  if (denominator === 0) return null; // unreachable past the guard; kept safe
  return (a * n - s) / denominator;
}

/**
 * The receipt inputs a reviewer needs to recompute the headline by hand:
 * `n`, the agreement sum `A`, the expected sum `S`, and the two products the
 * fast form divides. All are exact integers, so the arithmetic is one
 * division away from κ.
 */
export function kappaReceiptInputs(
  judge: readonly string[],
  human: readonly string[]
): { n: number; a: number; s: number; numerator: number; denominator: number } | null {
  if (distinctCount(judge) < 2 || distinctCount(human) < 2) return null;
  const n = Math.min(judge.length, human.length);
  if (n === 0) return null;

  const { labels, matrix, rowTotals, colTotals } = confusionMatrix(judge, human);
  let a = 0;
  let s = 0;
  for (let i = 0; i < labels.length; i++) {
    a += matrix[i]?.[i] ?? 0;
    s += (rowTotals[i] ?? 0) * (colTotals[i] ?? 0);
  }
  return { n, a, s, numerator: a * n - s, denominator: n * n - s };
}
