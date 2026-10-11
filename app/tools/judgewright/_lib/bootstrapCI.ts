/**
 * Judgewright — the seeded percentile bootstrap (SPEC §2.2, AC-13, AC-49, AC-52, AC-53).
 *
 * Index resampling, never relabelling: each replicate draws ROW INDICES with
 * replacement from the example list and recomputes the statistic on that
 * resample, so a replicate is a plausible alternative session of the same
 * size. The mean of a per-row vector is not a sampling distribution for κ or α
 * and is never substituted for one.
 *
 * Determinism is a hard contract (AC-13), not a hope:
 *   · ONE RNG stream (mulberry32) seeded from settings (default 42) — B is a
 *     PURE function of the row count, never of wall-clock time, so the same
 *     input reproduces byte-identical CIs in-process AND across processes.
 *   · ONE index array is drawn and reused for every statistic of a replicate,
 *     so accuracy, κ and α are computed on the SAME resample.
 *   · the percentile endpoints are linear-interpolation between closest ranks.
 *
 * The cooperative deadline may ABORT the replicates (the caller then gets null
 * CIs and `ciDropped`), but it can never change a point statistic or the
 * reported B (AGENTS §31).
 */

import { BOOTSTRAP_ALPHA_B, BOOTSTRAP_B, BOOTSTRAP_TIERS } from "./constants.ts";
import { kappaFromPairCounts } from "./cohensKappa.ts";
import {
  alphaFromPairCounts,
  alphaReplicateContext,
  type AlphaReplicateContext,
} from "./krippendorffAlpha.ts";
import type { AlphaLevel, ConfidenceInterval } from "./types.ts";

/** A per-replicate statistic over one index resample. */
export type StatFn = (selection: Int32Array, scratch: Float64Array) => number | null;

/** mulberry32: small, fast, seed-exact — the same stream on every platform. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The tier table is monotonic non-increasing by row count (AC-53):
 * ≤50,000 → 2,000 · ≤100,000 → 1,000 · ≤150,000 → 500 · ≤200,000 → 500, and
 * the last tier holds above the cap (rows never exceed MAX_ROWS).
 */
export function bootstrapTier(rowCount: number): number {
  const rows = Math.max(0, Math.floor(rowCount));
  for (const tier of BOOTSTRAP_TIERS) {
    if (rows <= tier.maxRows) return tier.b;
  }
  return BOOTSTRAP_B;
}

/** The α-specific replicate budget: `min(B, 250)` above 50,000 rows. */
export function alphaBootstrapTier(rowCount: number, b: number): number {
  const rows = Math.max(0, Math.floor(rowCount));
  if (rows > 50_000) return Math.min(b, BOOTSTRAP_ALPHA_B);
  return b;
}

/**
 * AC-53 copy, verbatim shape: `B = 500 (tiered for ≤200k rows; a smaller
 * dataset would get B = 2000)` — the actual tier's numbers only.
 */
/** `200000` → `200k`, matching the disclosed tier-copy contract (AC-53). */
function compactRows(rows: number): string {
  return rows >= 1_000 ? `${rows / 1_000}k` : String(rows);
}

export function bootstrapTierCopy(rowCount: number): string {
  const b = bootstrapTier(rowCount);
  const rows = Math.max(0, Math.floor(rowCount));
  let tierMax = BOOTSTRAP_TIERS[BOOTSTRAP_TIERS.length - 1]?.maxRows ?? rows;
  for (const tier of BOOTSTRAP_TIERS) {
    if (rows <= tier.maxRows) {
      tierMax = tier.maxRows;
      break;
    }
  }
  return `B = ${b} (tiered for ≤${compactRows(tierMax)} rows; a smaller dataset would get B = ${BOOTSTRAP_B})`;
}

/**
 * The panel encoded as integer class codes: `judgeIdx[i]` / `humanIdx[i]` are
 * the class index of row `i`, and `labels` is the sorted vocabulary so code
 * `c` always means `labels[c]`. Encoding once is what keeps every replicate
 * allocation-free (AC-49/AC-59 budgets).
 */
export interface PanelCodes {
  judgeIdx: Int32Array;
  humanIdx: Int32Array;
  /**
   * `humanIdx[i] * classes + judgeIdx[i]` — the class-pair cell of row `i`,
   * precomputed once so a replicate's inner loop is one read plus one
   * increment (the 200k-row tier budget of AC-59).
   */
  pairCode: Int32Array;
  labels: string[];
  classes: number;
}

/** Encode a judged panel into integer codes (label sorting is deterministic). */
export function encodePanel(
  judge: readonly string[],
  human: readonly string[]
): PanelCodes {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const label of judge) {
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  for (const label of human) {
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  labels.sort();

  const index = new Map<string, number>();
  labels.forEach((label, i) => index.set(label, i));

  const n = Math.min(judge.length, human.length);
  const judgeIdx = new Int32Array(n);
  const humanIdx = new Int32Array(n);
  const pairCode = new Int32Array(n);
  const size = labels.length;
  for (let i = 0; i < n; i++) {
    judgeIdx[i] = index.get(judge[i] as string) ?? 0;
    humanIdx[i] = index.get(human[i] as string) ?? 0;
    pairCode[i] = (humanIdx[i] as number) * size + (judgeIdx[i] as number);
  }
  return { judgeIdx, humanIdx, pairCode, labels, classes: size };
}

/** Fill the class-pair matrix `counts[human * classes + judge]` from a selection. */
function fillCounts(
  counts: Int32Array,
  panel: PanelCodes,
  selection: Int32Array,
  length: number
): void {
  counts.fill(0);
  const { pairCode } = panel;
  for (let i = 0; i < length; i++) {
    counts[pairCode[selection[i] as number] as number] += 1;
  }
}

/** Draw `length` indices in [0, rows) with replacement — the resample. */
function drawIndices(random: () => number, rows: number, selection: Int32Array): void {
  for (let i = 0; i < selection.length; i++) {
    selection[i] = Math.floor(random() * rows);
  }
}

/** The close enough for CI bookkeeping: a replicate that computed is finite. */
function isFiniteValue(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

/** Linear interpolation between closest ranks (numpy's default 'linear'). */
function percentile(
  sorted: Float64Array,
  count: number,
  probability: number
): number {
  if (count <= 0) return Number.NaN;
  if (count === 1) return sorted[0] as number;
  const clamped = probability <= 0 ? 0 : probability >= 1 ? 1 : probability;
  const position = (count - 1) * clamped;
  const low = Math.floor(position);
  const high = low + 1 < count ? low + 1 : count - 1;
  const weight = position - low;
  const lowValue = sorted[low] as number;
  const highValue = sorted[high] as number;
  return lowValue + weight * (highValue - lowValue);
}

/**
 * A percentile confidence interval from a set of replicate values. Fewer than
 * two usable replicates is not a CI — it is `null` with the reason, so a
 * caller can never display a single-point "interval".
 */
function percentileInterval(
  samples: Float64Array,
  count: number,
  point: number | null,
  seed: number,
  tailProbability: number
): ConfidenceInterval | null {
  if (count < 2 || point === null) return null;
  const usable = samples.slice(0, count);
  usable.sort();
  const low = percentile(usable, count, tailProbability / 2);
  const high = percentile(usable, count, 1 - tailProbability / 2);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return { point, low, high, replicates: count, seed };
}

/** How often a deadline-elapsed run is re-checked (cheap, bounded jitter). */
const DEADLINE_CHECK_INTERVAL = 128;

/**
 * The full estimator bootstrap: accuracy, κ, and — when budgeted — α over the
 * same [judge, human] pair panel, all three on ONE resample per replicate.
 *
 * Returns the three CIs, or nulls when a statistic is not defined on the full
 * sample (its point is null) or the deadline aborted the run.
 */
export interface BootstrapBundleOptions {
  seed: number;
  /** Replicates for accuracy and κ — the tier B, never the completed count. */
  B: number;
  /** Replicate budget for α, or omit to skip α entirely. */
  alphaB?: number;
  /** Tail probability, e.g. 0.05 for a 95% CI. */
  alpha?: number;
  /** Level for the α replicates (default nominal). */
  alphaLevel?: AlphaLevel;
  /** Explicit rank order for ordinal α replicates. */
  alphaOrder?: readonly string[];
  /**
   * Cooperative budget as an ABSOLUTE timestamp (`Date.now()` exceeding it
   * aborts the replicates); a trip drops the CIs, never the point statistics.
   */
  deadlineAt?: number;
}

export interface BootstrapBundleResult {
  accuracy: ConfidenceInterval | null;
  kappa: ConfidenceInterval | null;
  alpha: ConfidenceInterval | null;
  deadlineHit: boolean;
}

export function bootstrapBundle(
  panel: PanelCodes,
  options: BootstrapBundleOptions
): BootstrapBundleResult {
  const tailProbability = options.alpha ?? 0.05;
  const seed = options.seed;
  const replicatesB = Math.max(1, Math.floor(options.B));
  const alphaB = options.alphaB === undefined ? 0 : Math.max(0, Math.floor(options.alphaB));
  const rows = panel.judgeIdx.length;
  const seedToInt = seed >>> 0;

  if (rows < 2 || panel.classes < 2) {
    return { accuracy: null, kappa: null, alpha: null, deadlineHit: false };
  }
  // An already-expired budget drops the CIs before a single draw is spent; the
  // point statistics were computed by the caller and are untouched by this.
  if (options.deadlineAt !== undefined && Date.now() > options.deadlineAt) {
    return { accuracy: null, kappa: null, alpha: null, deadlineHit: true };
  }

  const alphaCtx: AlphaReplicateContext | null =
    alphaB > 0
      ? alphaReplicateContext(panel.labels, options.alphaLevel ?? "nominal", options.alphaOrder)
      : null;

  // The identity selection is the full sample: point statistics.
  const identity = new Int32Array(rows);
  for (let i = 0; i < rows; i++) identity[i] = i;
  const counts = new Int32Array(panel.classes * panel.classes);
  fillCounts(counts, panel, identity, rows);
  const accuracyPoint = sumDiagonal(counts, panel.classes) / rows;
  const kappaPoint = kappaFromPairCounts(counts, panel.classes);
  const alphaPoint = alphaCtx === null ? null : alphaFromPairCounts(counts, panel.classes, alphaCtx);

  // One stream, one index buffer, one fused pass — everything else is
  // bookkeeping. The mulberry32 arithmetic is INLINED and the index draw is
  // fused with the count accumulation: two traversals of a 200k-row typed
  // array cost three times what one does, and the tier budget is sized for
  // the single-pass loop (AC-59 budget).
  const { pairCode } = panel;
  let state = seedToInt;
  const accuracySamples = new Float64Array(replicatesB);
  const kappaSamples = new Float64Array(replicatesB);
  const alphaSamples = new Float64Array(Math.max(1, alphaB));
  let accuracyCount = 0;
  let kappaCount = 0;
  let alphaCount = 0;

  for (let replicate = 0; replicate < replicatesB; replicate++) {
    if (
      options.deadlineAt !== undefined &&
      replicate > 0 &&
      replicate % DEADLINE_CHECK_INTERVAL === 0 &&
      Date.now() > options.deadlineAt
    ) {
      return { accuracy: null, kappa: null, alpha: null, deadlineHit: true };
    }

    counts.fill(0);
    for (let i = 0; i < rows; i++) {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      // The same value mulberry32(seed) returns, inlined — a resample index
      // in [0, rows) either way, so the stream stays byte-reproducible.
      const row = (((t ^ (t >>> 14)) >>> 0) / 4294967296 * rows) | 0;
      counts[pairCode[row] as number] += 1;
    }

    // Accuracy shares the resample's counts with κ — one pass, one array.
    const accuracyValue = sumDiagonal(counts, panel.classes) / rows;
    if (isFiniteValue(accuracyValue)) accuracySamples[accuracyCount++] = accuracyValue;
    if (kappaPoint !== null) {
      const value = kappaFromPairCounts(counts, panel.classes);
      if (isFiniteValue(value)) kappaSamples[kappaCount++] = value;
    }
    if (alphaCtx !== null && alphaPoint !== null && replicate < alphaB) {
      const value = alphaFromPairCounts(counts, panel.classes, alphaCtx);
      if (isFiniteValue(value)) alphaSamples[alphaCount++] = value;
    }
  }

  return {
    accuracy: percentileInterval(
      accuracySamples,
      accuracyCount,
      accuracyPoint,
      seedToInt,
      tailProbability
    ),
    kappa: percentileInterval(
      kappaSamples,
      kappaCount,
      kappaPoint,
      seedToInt,
      tailProbability
    ),
    alpha: percentileInterval(
      alphaSamples,
      alphaCount,
      alphaPoint,
      seedToInt,
      tailProbability
    ),
    deadlineHit: false,
  };
}

/** The unaveraged diagonal of a class-pair matrix (the agreement count). */
function sumDiagonal(counts: Int32Array, classes: number): number {
  let total = 0;
  for (let c = 0; c < classes; c++) total += counts[c * classes + c] ?? 0;
  return total;
}

/**
 * A single-statistic bootstrap for a caller that supplies its own `StatFn`
 * over the resampled selection (the reusable script used by the
 * permuted-control and index-resampling property checks, AC-49).
 */
export function bootstrapCI(
  panel: PanelCodes,
  stat: StatFn,
  options: {
    seed: number;
    B: number;
    alpha?: number;
    /** Absolute cooperative deadline, as in `bootstrapBundle`. */
    deadlineAt?: number;
  }
): ConfidenceInterval | null {
  const rows = panel.judgeIdx.length;
  const replicates = Math.max(1, Math.floor(options.B));
  if (rows < 2) return null;

  const tailProbability = options.alpha ?? 0.05;
  const seedToInt = options.seed >>> 0;
  const random = mulberry32(seedToInt);
  const selection = new Int32Array(rows);
  const scratch = new Float64Array(panel.classes * panel.classes + 2);
  const point = stat(identitySelection(rows), scratch);

  const samples = new Float64Array(replicates);
  let count = 0;
  for (let replicate = 0; replicate < replicates; replicate++) {
    if (
      options.deadlineAt !== undefined &&
      replicate > 0 &&
      replicate % DEADLINE_CHECK_INTERVAL === 0 &&
      Date.now() > options.deadlineAt
    ) {
      return null;
    }
    drawIndices(random, rows, selection);
    const value = stat(selection, scratch);
    if (isFiniteValue(value)) samples[count++] = value;
  }
  return percentileInterval(samples, count, point, seedToInt, tailProbability);
}

/** The identity resample (the full sample, in input order). */
function identitySelection(rows: number): Int32Array {
  const identity = new Int32Array(rows);
  for (let i = 0; i < rows; i++) identity[i] = i;
  return identity;
}
