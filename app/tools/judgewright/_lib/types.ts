/**
 * Judgewright — shared types and the worker protocol (BAR §4.7).
 *
 * ZERO runtime imports: this file holds only `interface`/`type` declarations,
 * so no UI module can accidentally pull the compute core into the bundle.
 *
 * Scaffold state: the pipeline currently settles a trivial placeholder
 * measurement (character / word / byte counts + an echo of the analyzed
 * text). The statistics milestone (SPEC §2.2, PLAN M1/M2) extends this file
 * with the full `CalibrationReport` and the split disagreement payload.
 */

/** Which engine produced a settled result — printed in the receipt/badge. */
export type ComputeEngine = "worker" | "main-thread";

/**
 * The placeholder report the scaffold settles. Everything the real report
 * card needs beyond this (confusion matrix, unweighted κ, Δκ-deflation,
 * Krippendorff's α, bootstrap CIs, grade) is deliberately absent until the
 * statistics milestone lands — see `CalibrationReportSeam` below.
 */
export interface PlaceholderStats {
  characterCount: number;
  wordCount: number;
  byteCount: number;
  lineCount: number;
  /** First slice of the analyzed text so the pane can mirror the paste. */
  echo: string;
  /** True when the echo is shorter than the analyzed text. */
  echoTruncated: boolean;
  executionTimeMs: number;
  engine: ComputeEngine;
}

/** Persisted user settings (zustand `partialize` writes exactly this). */
export interface JudgewrightSettings {
  /** Bootstrap seed — deterministic, byte-reproducible CIs once M2 lands. */
  seed: number;
  /** 0.90 | 0.95 | 0.99 — the confidence level the CI panel will report. */
  confidenceLevel: number;
}

/** Worker input: the monotonic `id` makes the newest request win. */
export interface WorkerInputPayload {
  id: number;
  verdictsText: string;
  rubric: string;
  settings: JudgewrightSettings;
}

/** Errors are values, never throws (BAR §4.4). */
export type AnalysisOutcome =
  | { ok: true; stats: PlaceholderStats }
  | { ok: false; error: string };

/**
 * Worker output envelope. `degraded` is true when the result came back from
 * the synchronous main-thread fallback, so the UI can say so honestly.
 */
export interface WorkerOutputPayload {
  id: number;
  ok: boolean;
  error: string | null;
  degraded: boolean;
  stats: PlaceholderStats | null;
}

/** Result subset the hot path settles in one atomic `set()`. */
export interface ComputationResult {
  ok: boolean;
  error: string | null;
  degraded: boolean;
  stats: PlaceholderStats | null;
}

// ── Statistics seams (owned by the M1/M2 statistics milestone) ─────────────
// Minimal, zero-runtime placeholders so the seams exist on day one. Each one
// maps to a SPEC §2.2 table entry; nothing below is implemented yet.

export type KappaWeights = "unweighted" | "linear" | "quadratic";
export type AlphaLevel = "nominal" | "ordinal" | "interval";
export type BinMode = "width" | "freq";
/** Never auto-detected (SPEC §2.1.5) — user-selected in the toolbar. */
export type JudgeScoreMode = "p-positive" | "confidence";

/**
 * The future headline. Today the report card renders
 * "Calibration report card — compute enabled in next milestone"; when
 * `_lib/analyze.ts` grows into `_lib/report.ts` this becomes the settled
 * shape and `PlaceholderStats` folds into its receipt.
 */
export interface CalibrationReportSeam {
  /** Analyzed row count (≤ MAX_ROWS; the true total stays in `rowCount`). */
  n: number;
  /** Row count seen before the cap — always honest. */
  rowCount: number;
  labels: string[];
  /** Headline figures — unweighted κ drives the grade and the deflation. */
  rawAgreement: number | null;
  kappaUnweighted: number | null;
  deflation: number | null;
  grade: string;
}
