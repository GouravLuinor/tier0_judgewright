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
 * `w_ii = 0`, `w_ij = |i−j|` (linear) or `|i−j|²` (quadratic) over the sorted
 * label ranks. The weighted rows are a labelled SECONDARY row only — they never
 * feed the headline, the grade, the deflation or any CI. The unweighted case
 * always takes the integer fast path.
 *
 * `kappaFromPairCounts` is the same coefficient recomputed from an integer
 * class-pair matrix (`counts[human * classes + judge]`), which is what the
 * bootstrap consumes: the resample never rebuilds label strings.
 */

// NOTE: `.ts` specifiers on the value imports of the statistics core. Node
// strips types with full extension resolution only (`node
// --experimental-strip-types _lib/__tests__/repro.entry.ts` proves the seeded
// byte-reproducibility AC-13 across processes), so every module in that chain
// names its runtime dependencies with explicit extensions. Vite, webpack and
// tsc (`allowImportingTsExtensions`) all accept the same specifier.
import { confusionMatrix } from "./confusionMatrix.ts";
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
 * @param weights "unweighted" | "linear" | "quadratic" — the weighted variants
 *                are SECONDARY rows; everything the headline shows is
 *                unweighted.
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

  if (weights !== "unweighted") return weightedKappa(judge, human, weights);

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
 * Cohen's κ from an integer class-pair frequency matrix — the same
 * coefficient, the same guard, the same integer count algebra as the string
 * form, without touching a label. `counts[human * classes + judge]` mirrors the
 * confusion-matrix orientation (rows human, columns judge), so a full sample is
 * just this function over the identity selection. The bootstrap consumes it
 * once per replicate.
 */
export function kappaFromPairCounts(
  counts: Int32Array,
  classes: number
): number | null {
  if (classes < 2 || counts.length < classes * classes) return null;

  const rowTotals = new Array<number>(classes).fill(0);
  const colTotals = new Array<number>(classes).fill(0);
  let n = 0;
  let agree = 0;
  for (let human = 0; human < classes; human++) {
    for (let judge = 0; judge < classes; judge++) {
      const cell = counts[human * classes + judge] ?? 0;
      rowTotals[human] += cell;
      colTotals[judge] += cell;
      n += cell;
      if (human === judge) agree += cell;
    }
  }
  if (n === 0) return null;

  // The SAME degenerate guard as the string form: a constant rater has no κ.
  let humanWithHoldings = 0;
  let judgeWithHoldings = 0;
  for (let i = 0; i < classes; i++) {
    if ((rowTotals[i] as number) > 0) humanWithHoldings += 1;
    if ((colTotals[i] as number) > 0) judgeWithHoldings += 1;
  }
  if (humanWithHoldings < 2 || judgeWithHoldings < 2) return null;

  let products = 0;
  for (let i = 0; i < classes; i++) {
    products += (rowTotals[i] as number) * (colTotals[i] as number);
  }
  if (n * n === products) return null;

  return (agree * n - products) / (n * n - products);
}

/**
 * Weighted κ as `1 − D_o/D_e` in the standard weight form, on the same integer
 * count algebra as the unweighted fast path (so a constant weight reproduces
 * the unweighted coefficient). `w_ij = |i − j|` (linear) or `(i − j)²`
 * (quadratic) taken over the SORTED label ranks the confusion matrix exposes;
 * the diagonal is 0 by construction. SECONDARY rows only.
 */
function weightedKappa(
  judge: readonly string[],
  human: readonly string[],
  weights: "linear" | "quadratic"
): number | null {
  const { labels, matrix, rowTotals, colTotals } = confusionMatrix(judge, human);
  const size = labels.length;
  if (size < 2) return null;

  const n = Math.min(judge.length, human.length);
  if (n === 0) return null;

  // The single degenerate guard, unchanged: either rater constant ⇒ undefined.
  let humanWithHoldings = 0;
  let judgeWithHoldings = 0;
  for (let i = 0; i < size; i++) {
    if ((rowTotals[i] ?? 0) > 0) humanWithHoldings += 1;
    if ((colTotals[i] ?? 0) > 0) judgeWithHoldings += 1;
  }
  if (humanWithHoldings < 2 || judgeWithHoldings < 2) return null;

  const weight = (i: number, j: number): number => {
    const distance = Math.abs(i - j);
    return weights === "linear" ? distance : distance * distance;
  };

  let observed = 0;
  let expected = 0;
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (i === j) continue;
      const cell = matrix[i]?.[j] ?? 0;
      observed += weight(i, j) * cell;
      // Both sides of 1 − D_o/D_e carry the same 1/n, so it folds out.
      expected += weight(i, j) * (rowTotals[i] ?? 0) * (colTotals[j] ?? 0);
    }
  }
  if (expected === 0) return null; // no disagreement is possible: undefined

  return 1 - (observed * n) / expected;
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
