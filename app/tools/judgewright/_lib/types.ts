/**
 * Judgewright — shared types and the worker protocol (BAR §4.7).
 *
 * ZERO runtime imports: this file holds only `interface`/`type` declarations,
 * so no UI module can accidentally pull the compute core into the bundle.
 *
 * Every milestone named in the D-slices has SHIPPED (the parser, the label
 * vocabulary, the confusion matrix, the binary/k-class metrics, Cohen's
 * unweighted κ, the chance baseline, Krippendorff's α, the seeded bootstrap
 * CIs, ECE/Brier, the letter grade, position/verbosity bias and the
 * disagreement table), so the contract below is the settled one — the fields
 * each module owns are still `null`-able, and still never fabricated. This
 * module stays the single home for anything shared between the worker and the
 * UI, which is why it must keep ZERO runtime imports.
 */

/** Which engine produced a settled result — printed in the receipt/badge. */
export type ComputeEngine = "worker" | "main-thread";

/** Persisted user settings (zustand `partialize` writes exactly this). */
export interface JudgewrightSettings {
  /** Bootstrap seed — deterministic, byte-reproducible CIs once M2 lands. */
  seed: number;
  /** 0.90 | 0.95 | 0.99 — the confidence level the CI panel will report. */
  confidenceLevel: number;
  /**
   * How the judge_score column is read (AC-40/C2): `p-positive` (default) treats
   * the score as P(reference is positive); `confidence` treats it as the judge's
   * confidence in its OWN emitted label (D3). User-selected, never auto-detected.
   */
  judgeScoreMode: JudgeScoreMode;
  /** Override the default (second sorted) positive class; persisted when set. */
  positiveClass?: string;
  /** Explicit rank order for ordinal α on non-numeric labels. */
  labelOrder?: string[];
}

// ── Input model ────────────────────────────────────────────────────────────

/** One verdict row, parsed and normalized; `lineNumber` is the honest origin. */
export interface RawVerdict {
  exampleId: string;
  judgeLabel: string;
  /** ≥1; ≥2 enables the human ceiling (D2 α panel). */
  humanLabels: string[];
  /** Confidence in [0,1]; out-of-range ⇒ null (never clamped). */
  judgeScore: number | null;
  humanScore: number | null;
  judgeCritique: string | null;
  humanCritique: string | null;
  /** Optional passthrough for the table + the later LLM call. */
  judgeInput: string | null;
  judgeOutput: string | null;
  /** 0 | 1 — which slot the judge preferred (bias panel, D3). */
  position: number | null;
  preferredLonger: boolean | null;
  lineNumber: number;
}

/** The six parse error classes of SPEC §2.1.8 — each one an assertion target. */
export type ParseIssueClass =
  | "structure" // bad JSON line, CSV field/header mismatch, single-column file
  | "missing-field" // example_id / judge_label / human_label absent on a row
  | "bad-value" // non-numeric or out-of-range score, non-string label
  | "vocabulary" // two known label families in one label column — hard error
  | "capacity" // MAX_COLS / MAX_ROWS / MAX_INPUT_CHARS exceeded
  | "ambiguity"; // two distinct columns claim the same semantic slot

/** A parse failure as a VALUE: exact line, class and reason (BAR §4.4). */
export interface ParseIssue {
  line: number;
  cls: ParseIssueClass;
  column?: string;
  reason: string;
  excerpt?: string;
}

export type VerdictFormat = "jsonl" | "csv";

/**
 * A10 — the parse budget. `deadlineAt` is the ABSOLUTE wall-clock boundary
 * (`Date.now()`), checked every `PARSE_DEADLINE_CHECK_ROWS` rows; tripping it
 * settles a `capacity` parse error as a VALUE instead of holding the thread
 * until the whole paste is materialized. `budgetMs` is the budget it came
 * from, carried purely so the error copy can name it. Both are optional: the
 * unbiased unit tests (and the worker, which runs off-main-thread under its
 * own tiered watchdog) parse without one.
 */
export interface ParseOptions {
  deadlineAt?: number;
  budgetMs?: number;
}

/** Semantic slot → source column, produced by `mapColumns` (SPEC §2.1.2). */
export interface ColumnMapping {
  exampleId: string | null;
  judgeLabel: string | null;
  humanLabel: string | null;
  humanLabels: string | null;
  judgeScore: string | null;
  humanScore: string | null;
  judgeCritique: string | null;
  humanCritique: string | null;
  position: string | null;
  preferredLonger: string | null;
  input: string | null;
  output: string | null;
}

export interface ParseResult {
  verdicts: RawVerdict[];
  /** Capped at the first MAX_PARSE_ISSUES displayed; `issueCount` stays honest. */
  issues: ParseIssue[];
  issueCount: number;
  /**
   * True when a HARD error aborted the parse (mixed vocabularies, capacity,
   * single-column input, ambiguity on an id/label slot). No partial report is
   * ever built from a fatal parse.
   */
  fatal: boolean;
  format: VerdictFormat;
  /** Data rows seen before the row cap (the true total, never truncated). */
  rowCount: number;
  /** rowCount > MAX_ROWS — capped BEFORE analysis. */
  capped: boolean;
  columns: string[];
  mapping: ColumnMapping;
  warnings: string[];
  /**
   * A12 — TRUE when two distinct columns/keys map to the SAME `judge_score`
   * slot. The label slots stay hard errors; a duplicated SCORE slot is legal
   * on the labels, but it makes the score column ambiguous, so the
   * calibration panel must be reported NOT COMPUTABLE rather than computed
   * from whichever alias happened to win. `computeReport` receives this flag
   * through `ComputeOptions.judgeScoreAmbiguous`.
   */
  judgeScoreAmbiguous: boolean;
}

// ── Statistics ─────────────────────────────────────────────────────────────

export type KappaWeights = "unweighted" | "linear" | "quadratic";
export type AlphaLevel = "nominal" | "ordinal" | "interval";
export type BinMode = "width" | "freq";
/** Never auto-detected (SPEC §2.1.5) — user-selected in the toolbar. */
export type JudgeScoreMode = "p-positive" | "confidence";

/** rows = human, cols = judge; labels sorted ascending (SPEC §2.2). */
export interface ConfusionMatrix {
  labels: string[];
  matrix: number[][]; // [humanIndex][judgeIndex]
  rowTotals: number[]; // human marginals
  colTotals: number[]; // judge marginals
}

export interface BinaryMetrics {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  tpr: number | null;
  tnr: number | null;
  ppv: number | null;
  fpr: number | null;
  f1: number | null;
  /** Echoed: the class tp/fn are measured against. */
  positiveClass: string;
}

export interface MulticlassMetrics {
  perLabel: Array<{
    label: string;
    precision: number | null;
    recall: number | null;
    f1: number | null;
    support: number;
  }>;
  macroPrecision: number | null;
  macroRecall: number | null;
  macroF1: number | null;
}

export interface ConfidenceInterval {
  point: number;
  low: number;
  high: number;
  /** The B actually used (tiered, honest). */
  replicates: number;
  seed: number;
}

/**
 * The always-majority dummy. `baselineKappa` is the ANALYTIC p_o = p_e
 * identity, so it is exactly 0 — never routed through `cohensKappa`, which
 * refuses constant raters by design (ARCHITECTURE §4).
 */
export interface ChanceBaseline {
  majorityClass: string;
  /** Always-guess-majority agreement against the human labels. */
  baselineAgreement: number;
  /** ≡ 0 by construction (the identity, asserted at AC-09). */
  baselineKappa: number;
  /** Human label shares, summing to 1. */
  labelDistribution: Record<string, number>;
}

// ── Deferred panels (typed seams for D2/D3 — no fabricated values) ──────────

export interface CalibrationPanel {
  ece: number | null;
  brier: number | null;
  bins: number;
  mode: BinMode;
  scoreMode: JudgeScoreMode;
  positiveClass: string | null;
  mismatchWarning: string | null;
  ambiguousReason: string | null;
  /** The honest not-computable reason (FM-3); null when the panel is computable. */
  reason: string | null;
  scoreCount: number;
  /** false ⇒ the UI says "not computable from your input". */
  computable: boolean;
}

export interface BiasPanel {
  computable: boolean;
  missingColumns: string[];
  /** P(first slot) − 0.5 — deviation of first-slot preference from even. */
  positionBias: number | null;
  positionN: number;
  /**
   * P(preferred answer was longer) − 0.5 — deviation of length-preference
   * from even, the honest one-flag form of "P(judge) − P(human)" (the judge
   * vs human split is not in a single preference column).
   */
  verbosityBias: number | null;
  verbosityN: number;
  note: string;
}

export interface DisagreementRow {
  exampleId: string;
  humanLabel: string;
  humanLabels: string[];
  judgeLabel: string;
  agree: boolean;
  judgeScore: number | null;
  humanScore: number | null;
  judgeCritique: string | null;
  humanCritique: string | null;
  judgeInput: string | null;
  judgeOutput: string | null;
  lineNumber: number;
}

/** The display window only; the full set is pulled on demand (D3). */
export interface DisagreementWindow {
  offset: number;
  rows: DisagreementRow[];
  totalCount: number;
}

// ── Report ────────────────────────────────────────────────────────────────

export interface ComputeOptions {
  seed: number;
  confidenceLevel: number;
  /**
   * Default = second sorted label (documented in `confusionMatrix.ts`).
   * The one-click selector UI lands in D3.
   */
  positiveClass?: string;
  /**
   * Secondary-row selection only; the headline κ, the deflation and any CI are
   * ALWAYS the unweighted κ. D2 implements the weighted rows.
   */
  kappaWeights?: KappaWeights;
  /**
   * Krippendorff's α level (default nominal). D2 computes all three; the
   * one-click selector UI lands in D3.
   */
  alphaLevel?: AlphaLevel;
  /**
   * Explicit rank order for ordinal α on non-numeric labels. Without it (and
   * without numeric labels) ordinal α falls back to nominal with a warning —
   * never a silent alphabetical order.
   */
  /**
   * Score semantics for ECE/Brier (D3, AC-40). Default `p-positive`. Never
   * auto-detected — a mode mismatch surfaces the amber hint instead (AC-41).
   */
  judgeScoreMode?: JudgeScoreMode;
  /** ECE bin count (default 10, equal-width). */
  bins?: number;
  /** ECE binning scheme (default `width`). */
  binMode?: BinMode;
  /**
   * Explicit rank order for ordinal α on non-numeric labels.
   */
  labelOrder?: string[];
  /**
   * A12 — the parse-derived `judge_score` mapping ambiguity, so a duplicated
   * score column is reported as a not-computable calibration panel instead of
   * a confident number computed from an arbitrary alias.
   */
  judgeScoreAmbiguous?: boolean;
  /** Parse-derived honesty: rowCount > MAX_ROWS was capped before analysis. */
  truncated?: boolean;
  /** Parse-derived: the true row total seen before the row cap. */
  rowCount?: number;
  /** Cooperative budget (worker 1,000, sync 800). */
  deadlineMs?: number;
  /**
   * A2 — the cooperative budget as an ABSOLUTE timestamp (`Date.now()`), so it
   * covers the WHOLE pipeline (parse included) instead of only the compute
   * phases. Supplied by `analyzeVerdicts`; without it the budget starts at
   * `computeReport`. A trip drops the CIs (never a point statistic).
   */
  deadlineAt?: number;
  /** Which engine is running — stamped into the report, never guessed. */
  engine?: ComputeEngine;
}

/**
 * The calibration report. D1 fills the point statistics; every field a later
 * milestone owns is present and explicitly null/empty so the seams stay typed
 * instead of fake.
 */
export interface CalibrationReport {
  /** Analyzed row count (≤ MAX_ROWS). */
  n: number;
  /** Row count seen before the cap — always honest. */
  rowCount: number;
  labels: string[];
  binary: boolean;
  /** Second sorted label by default, user-overridable. */
  positiveClass: string | null;
  accuracy: number;
  /** The headline name for the same exact-match agreement figure. */
  rawAgreement: number;
  agreementRows: number;
  /**
   * A3 — the TRUE agreeing-row count over the FULL analyzed set, never the
   * display window — the worker payload ships only `MAX_TABLE_ROWS` rows, so
   * a windowed count printed as a total is a fabricated number; these two
   * fields are the honest totals the export and the card print.
   */
  agreementTotal: number;
  /** The TRUE disagreeing-row count over the FULL analyzed set. */
  disagreementTotal: number;
  confusion: ConfusionMatrix;
  binaryMetrics: BinaryMetrics | null;
  multiclass: MulticlassMetrics | null;
  /** ★ UNWEIGHTED — the headline. */
  kappa: number | null;
  /** Weighted SECONDARY rows — never the headline, grade or deflation. */
  kappaLinear: number | null;
  kappaQuadratic: number | null;
  /** Degenerate rater ⇒ null before either arithmetic path. */
  kappaUndefinedReason: string | null;
  /** α over [judge, human1, human2, …] — the judge is a panel member. */
  alphaPanel: number | null;
  alphaHumans: number | null;
  alphaLevel: AlphaLevel;
  alphaUndefinedReason: string | null;
  alphaWarning: string | null;
  /** The α replicate budget the tier rule applied (250 above 50k rows). */
  alphaReplicates: number | null;
  baseline: ChanceBaseline;
  /** accuracy − κ_unweighted (the Δκ headline figure). */
  deflation: number | null;
  /** accuracy − baselineAgreement. */
  liftOverBaseline: number | null;
  /** Seeded, byte-reproducible percentile CIs. */
  ci: {
    accuracy: ConfidenceInterval | null;
    kappa: ConfidenceInterval | null;
    alpha: ConfidenceInterval | null;
  };
  /** D3 seam: ECE / Brier panel. */
  calibration: CalibrationPanel | null;
  /** D3 seam: position / verbosity bias. */
  bias: BiasPanel;
  /** Letter grade of the UNWEIGHTED κ (Landis–Koch, disclosed). */
  grade: string;
  gradeLabel: string;
  /**
   * The per-example rows. The pure core fills ALL analyzed rows; the worker
   * payload ships the first `MAX_TABLE_ROWS` as the display window (see
   * `reportDisagreementWindow`), because the full set is never
   * structured-cloned per dispatch. The SETTLED report — the one the store,
   * the exports and the diagnosis selection read — always carries this same
   * window on both engines, so no exported artifact differs by engine (A3).
   */
  disagreements: DisagreementRow[];
  /** Markdown: exact formula + inputs so a reviewer can recompute. */
  receipt: string;
  executionTimeMs: number;
  /** The tier B actually used — a pure function of the row count. */
  bootstrapReplicates: number;
  /** The α replicate count the α CI really consumed (null if not computed). */
  alphaBootstrapReplicates: number | null;
  /** True only when the cooperative deadline aborted the CIs. */
  ciDropped: boolean;
  engine: ComputeEngine;
  truncated: boolean;
}

// ── Analysis envelope ───────────────────────────────────────────────────────

/** Parse facts that ride along with every settled analysis. */
export interface ParseSummary {
  format: VerdictFormat;
  rowCount: number;
  capped: boolean;
  issues: ParseIssue[];
  issueCount: number;
  warnings: string[];
}

/**
 * The settled payload: the full D1 point statistics plus the honest counts of
 * the analyzed paste. `characterCount/wordCount/byteCount/lineCount` describe
 * the WHOLE paste even when the report only covers the valid rows.
 */
export interface VerdictAnalysis {
  report: CalibrationReport;
  parse: ParseSummary;
  characterCount: number;
  wordCount: number;
  byteCount: number;
  lineCount: number;
  executionTimeMs: number;
  engine: ComputeEngine;
}

/** Errors are values, never throws (BAR §4.4). */
export type AnalysisOutcome =
  | { ok: true; stats: VerdictAnalysis }
  | {
      ok: false;
      error: string;
      /** First MAX_PARSE_ISSUES issues, so the pane can list them (AC-35). */
      issues: ParseIssue[];
      issueCount: number;
    };

/** Worker input: the monotonic `id` makes the newest request win. */
export interface WorkerInputPayload {
  id: number;
  verdictsText: string;
  rubric: string;
  settings: JudgewrightSettings;
}

/**
 * Worker output envelope. `degraded` is true when the result came back from
 * the synchronous main-thread fallback, so the UI can say so honestly. The
 * disagreement window is the D3 seam: `rows` stays empty until the table
 * milestone, while `totalCount` is the honest count.
 */
export interface WorkerOutputPayload {
  id: number;
  ok: boolean;
  error: string | null;
  degraded: boolean;
  stats: VerdictAnalysis | null;
  issues: ParseIssue[];
  issueCount: number;
  disagreementWindow: DisagreementWindow;
}

/** Result subset the hot path settles in one atomic `set()`. */
export interface ComputationResult {
  ok: boolean;
  error: string | null;
  degraded: boolean;
  stats: VerdictAnalysis | null;
  issues?: ParseIssue[];
  issueCount?: number;
}
