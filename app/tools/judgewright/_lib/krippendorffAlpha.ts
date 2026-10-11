/**
 * Judgewright — Krippendorff's α (SPEC §2.2, AC-06/07/08, AC-34, AC-43…AC-45, AC-50).
 *
 * One coefficient, three difference functions, computed from the coincidence
 * matrix of a coder panel. With `m_u` the number of coders on unit `u`, `n` the
 * number of pairable values, `n_v` the marginal count of value `v` and `δ` the
 * difference function of the chosen level:
 *
 *     D_o = Σ_u Σ_{i≠j} δ(v_i, v_j) / (m_u − 1)          observed disagreement
 *     D_e = (1 / (n − 1)) · Σ_{c≠k} n_c·n_k·δ(c, k)      expected disagreement
 *     α   = 1 − D_o / D_e
 *
 * `δ` is `1` (nominal), `(v − v′)²` (interval) or
 * `(Σ_{g=v}^{v′} n_g − (n_v + n_v′)/2)²` (ordinal, ranks only). Every sum is an
 * exact count of pairs, so the computation is `+ , − , × , ÷` of doubles — no
 * transcendentals (AC-60).
 *
 * Level guards (SPEC §2.2, the C4 rules):
 *   · `interval` requires EVERY label to parse as a finite number, else the
 *     result is `null` with the reason — never a silent coercion.
 *   · `ordinal` needs numeric labels OR an explicit `labelOrder`. Without
 *     either there is no defensible rank order, so the value falls back to
 *     nominal WITH a warning — never a silent alphabetical sort order.
 *   · a two-value scale makes every ordinal difference a CONSTANT multiple of
 *     the nominal one, so the ordinal path runs the nominal arithmetic and the
 *     two coefficients are bit-for-bit identical (AC-08).
 *
 * The panel is `[judge, human1, human2, …]` per row; the human ceiling drops
 * the judge and is computable only with ≥2 human raters (AC-34). With one
 * human rater the panel is exactly two coders, which is why the κ-vs-α
 * disclosure below is mandatory rather than optional (AC-50).
 */

import type { AlphaLevel } from "./types.ts";

/** The α result as a VALUE: never NaN, never a fabricated 0 (FM-12). */
export interface AlphaResult {
  value: number | null;
  reason: string | null;
  warning: string | null;
}

/**
 * AC-50, verbatim — with one human rater the panel is two coders, so α and κ
 * are two different chance-corrected coefficients over the same 2×2. The panel
 * MUST say so.
 */
export const ALPHA_VS_KAPPA_DISCLOSURE =
  "with one human rater the panel is 2 coders, so this is Krippendorff's α (a chance-corrected coefficient), not Cohen's κ; the two differ by construction";

/** AC-50: the letter grade on α is a comparability aid, not α's convention. */
export const ALPHA_KAPPA_BANDS_NOTE =
  "κ-bands applied to α for comparability — not α's own convention";

/** AC-34: the human ceiling needs a second human rater, not a guess. */
export const ALPHA_CEILING_NEEDS_RATERS =
  "Human ceiling needs ≥2 human raters per example.";

/** AC-43: the interval guard fires with this reason, and nothing else. */
export const ALPHA_INTERVAL_REASON = "interval α needs numeric labels; use nominal";

/** AC-45: the ordinal fallback warning, verbatim. */
export const ALPHA_ORDINAL_FALLBACK_WARNING =
  "ordinal α needs numeric labels or an explicit labelOrder — falling back to nominal";

/** FM-12: fewer than two pairable values anywhere in the panel. */
export const ALPHA_UNDERPAIRED_REASON =
  "α needs at least two coders on at least two examples.";

/** A constant panel has no chance variance to correct for (the α analogue of FM-4). */
export const ALPHA_UNDEFINED_COPY =
  "α is undefined: no label variance to correct for. Report agreement instead.";

/** Parse a label as a finite number; blank or non-numeric ⇒ null (never NaN). */
function parseNumeric(label: string): number | null {
  if (label.trim().length === 0) return null;
  const value = Number(label);
  return Number.isFinite(value) ? value : null;
}

/** The rank order for an ordinal/interval level, plus the guard outcomes. */
interface AlphaOrdering {
  /** Effective level — nominal when ordinal fell back. */
  level: AlphaLevel;
  /** Labels in RANK order (labelOrder ⇒ numeric order). */
  order: string[];
  /** rank position per class: rankOf[classIndex] = position in `order`. */
  rankOf: number[];
  /** numeric value per class (interval only), aligned with `classes`. */
  valuesByClass: (number | null)[];
  warning: string | null;
  reason: string | null;
}

/**
 * Resolve the rank order. Non-numeric labels WITHOUT an explicit `labelOrder`
 * can only be ordered alphabetically, which is meaningless for ordinal data —
 * so that case is nominal + warning, never a silent sort.
 */
function resolveOrdering(
  classes: readonly string[],
  level: AlphaLevel,
  labelOrder?: readonly string[]
): AlphaOrdering {
  if (level === "nominal") {
    return { level: "nominal", order: [...classes], rankOf: classes.map((_, i) => i), valuesByClass: [], warning: null, reason: null };
  }

  if (level === "interval") {
    const valuesByClass = classes.map(parseNumeric);
    if (valuesByClass.some((value) => value === null)) {
      return {
        level: "interval",
        order: [...classes],
        rankOf: classes.map((_, i) => i),
        valuesByClass,
        warning: null,
        reason: ALPHA_INTERVAL_REASON,
      };
    }
    const ranked = rankNumeric(classes, valuesByClass as number[]);
    return { level: "interval", order: ranked.order, rankOf: ranked.rankOf, valuesByClass, warning: null, reason: null };
  }

  // Ordinal: numeric labels order by value, otherwise an explicit labelOrder,
  // otherwise nominal with the mandatory warning.
  const numeric = classes.map(parseNumeric);
  if (numeric.every((value) => value !== null)) {
    const ranked = rankNumeric(classes, numeric as number[]);
    return { level: "ordinal", order: ranked.order, rankOf: ranked.rankOf, valuesByClass: numeric, warning: null, reason: null };
  }
  if (labelOrder && labelOrder.length > 0) {
    const present = new Set(classes);
    const explicit = labelOrder.filter((label) => present.has(label));
    const rest = classes.filter((label) => !explicit.includes(label));
    const order = [...explicit, ...rest];
    const rankOf = new Array<number>(classes.length).fill(0);
    order.forEach((label, position) => {
      const classIndex = classes.indexOf(label);
      if (classIndex >= 0) rankOf[classIndex] = position;
    });
    return { level: "ordinal", order, rankOf, valuesByClass: classes.map(() => null), warning: null, reason: null };
  }
  return {
    level: "nominal",
    order: [...classes],
    rankOf: classes.map((_, i) => i),
    valuesByClass: [],
    warning: ALPHA_ORDINAL_FALLBACK_WARNING,
    reason: null,
  };
}

/** Order classes by their numeric value; ties break on the label (deterministic). */
function rankNumeric(
  classes: readonly string[],
  values: readonly number[]
): { order: string[]; rankOf: number[] } {
  const ranked = classes
    .map((label, index) => ({ label, index, value: values[index] as number }))
    .sort((a, b) => (a.value === b.value ? (a.label < b.label ? -1 : 1) : a.value - b.value));
  const order = ranked.map((entry) => entry.label);
  const rankOf = new Array<number>(classes.length).fill(0);
  order.forEach((label, position) => {
    rankOf[classes.indexOf(label)] = position;
  });
  return { order, rankOf };
}

/** δ² between two classes: 1 nominal, (v−v′)² interval, rank-sum ordinal. */
function classDistance(
  level: AlphaLevel,
  i: number,
  j: number,
  rankOf: readonly number[],
  valuesByClass: readonly (number | null)[],
  marginalsByRank: readonly number[]
): number {
  if (level === "nominal") return 1;
  if (level === "interval") {
    const difference = (valuesByClass[i] as number) - (valuesByClass[j] as number);
    return difference * difference;
  }
  // Ordinal: (Σ_{g=v}^{v′} n_g − (n_v + n_v′)/2)² over RANK positions.
  const ri = rankOf[i] as number;
  const rj = rankOf[j] as number;
  const low = Math.min(ri, rj);
  const high = Math.max(ri, rj);
  let between = 0;
  for (let g = low; g <= high; g++) between += marginalsByRank[g] ?? 0;
  const halves =
    ((marginalsByRank[ri] ?? 0) + (marginalsByRank[rj] ?? 0)) / 2;
  const distance = between - halves;
  return distance * distance;
}

/**
 * The δ matrix (row-major, one side per class). A two-class scale makes every
 * ordinal difference a CONSTANT multiple of the nominal one, which cancels in
 * D_o / D_e — so the binary ordinal path runs the nominal arithmetic and the
 * two coefficients are bit-for-bit identical (AC-08).
 */
function deltaMatrix(
  level: AlphaLevel,
  size: number,
  rankOf: readonly number[],
  valuesByClass: readonly (number | null)[],
  marginalsByRank: readonly number[]
): Float64Array {
  const effective = level === "ordinal" && size === 2 ? "nominal" : level;
  const delta = new Float64Array(size * size);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (i === j) continue;
      delta[i * size + j] = classDistance(effective, i, j, rankOf, valuesByClass, marginalsByRank);
    }
  }
  return delta;
}

/**
 * Krippendorff's α over a coder panel.
 *
 * @param units  one entry per example; each entry is one label per coder
 *               (`[judge, human1, human2, …]` for the panel, humans only for
 *               the ceiling). Units with fewer than two labels are not
 *               pairable and are skipped, as are blank labels.
 * @param level  nominal (default) | ordinal | interval.
 * @param labelOrder explicit rank order for ordinal α on non-numeric labels.
 * @returns the coefficient, or null with a reason and/or a fallback warning.
 */
export function krippendorffAlpha(
  units: readonly (readonly string[])[],
  level: AlphaLevel = "nominal",
  labelOrder?: readonly string[]
): AlphaResult {
  const pairable: string[][] = [];
  let total = 0;
  for (const unit of units) {
    const values: string[] = [];
    for (const value of unit) {
      if (typeof value === "string" && value.trim().length > 0) values.push(value);
    }
    if (values.length < 2) continue;
    pairable.push(values);
    total += values.length;
  }

  if (pairable.length === 0 || total < 2) {
    return { value: null, reason: ALPHA_UNDERPAIRED_REASON, warning: null };
  }

  const classes: string[] = [];
  const seen = new Set<string>();
  for (const values of pairable) {
    for (const value of values) {
      if (seen.has(value)) continue;
      seen.add(value);
      classes.push(value);
    }
  }
  classes.sort();

  const ordering = resolveOrdering(classes, level, labelOrder);
  if (ordering.reason !== null) {
    return { value: null, reason: ordering.reason, warning: null };
  }

  const size = classes.length;
  const classIndexOf = new Map<string, number>();
  classes.forEach((label, index) => classIndexOf.set(label, index));

  // Pass 1 — marginals per class. The ordinal δ depends on them, so the
  // difference matrix can only be built once they are complete.
  const marginalByClass = new Array<number>(size).fill(0);
  for (const values of pairable) {
    for (let i = 0; i < values.length; i++) {
      const row = classIndexOf.get(values[i] as string) ?? 0;
      marginalByClass[row] += 1;
    }
  }

  // A constant panel has no chance variance to correct for: 0/0, not a zero
  // (the α analogue of the κ FM-4 guard).
  let largest = 0;
  for (let i = 0; i < size; i++) {
    if ((marginalByClass[i] as number) > largest) largest = marginalByClass[i] as number;
  }
  if (largest >= total) {
    return { value: null, reason: ALPHA_UNDEFINED_COPY, warning: ordering.warning };
  }

  const marginalByRank = new Array<number>(size).fill(0);
  for (let i = 0; i < size; i++) {
    marginalByRank[ordering.rankOf[i] as number] = marginalByClass[i] as number;
  }

  const delta = deltaMatrix(
    ordering.level,
    size,
    ordering.rankOf,
    ordering.valuesByClass,
    marginalByRank
  );

  // Pass 2 — observed disagreement: every ordered pair within a unit, each
  // weighted by 1/(m_u − 1). Equal values contribute δ = 0 at every level.
  let observed = 0;
  for (const values of pairable) {
    const weight = 1 / (values.length - 1);
    for (let i = 0; i < values.length; i++) {
      const row = classIndexOf.get(values[i] as string) ?? 0;
      for (let j = 0; j < values.length; j++) {
        if (i === j) continue;
        const col = classIndexOf.get(values[j] as string) ?? 0;
        if (row === col) continue;
        observed += delta[row * size + col] * weight;
      }
    }
  }

  // Expected disagreement over all ordered value pairs, chance-shuffled.
  let expected = 0;
  for (let c = 0; c < size; c++) {
    for (let k = 0; k < size; k++) {
      if (c === k) continue;
      const pairs = ((marginalByClass[c] as number) * (marginalByClass[k] as number)) / (total - 1);
      expected += pairs * delta[c * size + k];
    }
  }

  if (expected === 0) {
    return { value: null, reason: ALPHA_UNDEFINED_COPY, warning: ordering.warning };
  }

  return { value: 1 - observed / expected, reason: null, warning: ordering.warning };
}

// ── The bootstrap replicate path ────────────────────────────────────────────

/**
 * Everything one resample needs to recompute α over the `[judge, human]` pair
 * panel. Built ONCE from the class vocabulary; per-replicate work is then pure
 * counting, so the bootstrap stays a single arithmetic pass (AC-13/AC-49).
 */
export interface AlphaReplicateContext {
  /** The effective level — nominal when ordinal fell back to nominal. */
  level: AlphaLevel;
  /** Class labels in LEXICAL order (the matrix axes), aligned with the codes. */
  classes: string[];
  /** Rank position per class index (ordinal/interval ordering). */
  rankOf: number[];
  /** Numeric value per class index (interval only). */
  valuesByClass: (number | null)[];
}

/**
 * The replicate context for a class vocabulary, or null when the level cannot
 * be computed on that vocabulary (interval α on non-numeric labels — the CI is
 * then null, never a fabricated number).
 */
export function alphaReplicateContext(
  classes: readonly string[],
  level: AlphaLevel,
  labelOrder?: readonly string[]
): AlphaReplicateContext | null {
  const sorted = [...classes].sort();
  const ordering = resolveOrdering(sorted, level, labelOrder);
  if (ordering.reason !== null) return null;
  return {
    level: ordering.level,
    classes: sorted,
    rankOf: ordering.rankOf,
    valuesByClass: ordering.valuesByClass,
  };
}

/**
 * α over one resample, fed by the class-pair frequency matrix
 * `counts[human * classes + judge]` (every unit is exactly two coders, so each
 * disagreeing unit contributes its δ twice and the expected matrix divides by
 * `n − 1`). Returns null when the replicate carries no chance variance — the
 * caller drops it rather than inventing a value.
 */
export function alphaFromPairCounts(
  counts: Int32Array,
  classes: number,
  ctx: AlphaReplicateContext
): number | null {
  let units = 0;
  for (let i = 0; i < counts.length; i++) units += counts[i] as number;
  // Every unit of this path is exactly two coders, so `n` in the α formula —
  // the number of pairable VALUES — is twice the unit count.
  const total = units * 2;
  if (units < 1 || total < 2 || classes < 2) return null;

  const marginalByClass = new Array<number>(classes).fill(0);
  for (let human = 0; human < classes; human++) {
    for (let judge = 0; judge < classes; judge++) {
      const cell = counts[human * classes + judge] ?? 0;
      marginalByClass[human] += cell;
      marginalByClass[judge] += cell;
    }
  }

  let largest = 0;
  for (let i = 0; i < classes; i++) {
    if ((marginalByClass[i] as number) > largest) largest = marginalByClass[i] as number;
  }
  if (largest >= total) return null;

  const marginalByRank = new Array<number>(classes).fill(0);
  for (let i = 0; i < classes; i++) {
    marginalByRank[ctx.rankOf[i] ?? i] = marginalByClass[i] as number;
  }

  const size = classes;
  const delta = deltaMatrix(ctx.level, size, ctx.rankOf, ctx.valuesByClass, marginalByRank);

  // Observed: two ordered pairs per unit (judge→human and human→judge).
  let observed = 0;
  for (let human = 0; human < size; human++) {
    for (let judge = 0; judge < size; judge++) {
      if (human === judge) continue;
      const cell = counts[human * size + judge] ?? 0;
      observed += 2 * cell * delta[human * size + judge];
    }
  }

  let expected = 0;
  for (let c = 0; c < size; c++) {
    for (let k = 0; k < size; k++) {
      if (c === k) continue;
      const pairs = ((marginalByClass[c] as number) * (marginalByClass[k] as number)) / (total - 1);
      expected += pairs * delta[c * size + k];
    }
  }

  if (expected === 0) return null;
  return 1 - observed / expected;
}
