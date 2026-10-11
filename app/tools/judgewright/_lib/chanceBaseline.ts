/**
 * Judgewright — the always-majority chance baseline (SPEC §2.2, AC-09).
 *
 * `baselineAgreement` is the largest HUMAN label share: the agreement an
 * always-guess-the-majority dummy judge would reach against these human
 * labels. It is the number the headline compares κ against, so a κ near zero
 * reads as "indistinguishable from always-pass".
 *
 * `baselineKappa` is derived ANALYTICALLY from the p_o = p_e identity — it is
 * NOT computed by routing the constant dummy through `cohensKappa`, which
 * refuses constant raters by design (AC-42). The derivation, with `c*` the
 * majority human label and `n` the row count:
 *
 *     the dummy's judge marginal is n at c* and 0 elsewhere, so
 *     S_dummy = n·n_c*   and   A_dummy = n_c*
 *     κ = (A·n − S)/(n² − S) = (n_c*·n − n_c*·n)/(n² − n_c*·n) = 0 exactly
 *
 * Both numerator and denominator reduce to exact integers before the single
 * division, so the result is the double 0 — asserted ≤ 1e-15 across the base
 * rates of AC-09 (0.05 … 0.99).
 */

import { normalizeLabel } from "./labels";
import type { ChanceBaseline } from "./types";

/**
 * The always-majority baseline for one session.
 *
 * `labelDistribution` reports the HUMAN label shares (they sum to 1), so the
 * receipt can print the distribution the baseline came from.
 */
export function chanceBaseline(
  judge: readonly string[],
  human: readonly string[]
): ChanceBaseline {
  const n = Math.min(judge.length, human.length);

  const counts = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const label = normalizeLabel(human[i] ?? "");
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const labelDistribution: Record<string, number> = {};
  let majorityClass = "";
  let majorityCount = 0;
  for (const [label, count] of counts) {
    labelDistribution[label] = n > 0 ? count / n : 0;
    // Ties break on the first label in sorted order, so the choice is
    // deterministic regardless of input order.
    if (
      count > majorityCount ||
      (count === majorityCount && majorityClass !== "" && label < majorityClass)
    ) {
      majorityClass = label;
      majorityCount = count;
    }
  }

  const baselineAgreement = n > 0 ? majorityCount / n : 0;

  // The analytic p_o = p_e identity, computed with the dummy's INTEGER
  // marginals so the zero is exact rather than a rounded difference.
  const baselineKappa = analyticBaselineKappa(n, majorityCount);

  return { majorityClass, baselineAgreement, baselineKappa, labelDistribution };
}

/**
 * `κ` of the always-majority dummy, derived from the identity. When every
 * human carries the same label the dummy agrees and is expected to agree with
 * probability 1, so `1 − (1−1)/(1−1)` is read through the identity as exactly
 * 0 as well — the same conclusion, stated without the 0/0.
 */
function analyticBaselineKappa(n: number, majorityCount: number): number {
  if (majorityCount <= 0 || n <= 0) return 0;
  const aDummy = majorityCount; // the single diagonal cell the dummy fills
  const sDummy = majorityCount * n; // its judge marginal is n at the majority
  if (n * n - sDummy === 0) return 0; // every human label identical → identity
  return (aDummy * n - sDummy) / (n * n - sDummy);
}
