# Judgewright — ARCHITECTURE (v1, planning artifact)

> **Status:** PLANNING DOCUMENT. Companion to [`SPEC.md`](./SPEC.md) and [`PLAN.md`](./PLAN.md).
> Every signature below is the contract the build must implement; every number in the caps
> table was measured on the reference machine (see `PLAN.md` §1.6 / §1.8).
> Revised by the PLAN REVISER: every CRITICAL/MAJOR/MINOR review finding is encoded here.
>
> **Canonical references:** `regex-craft/docs/blueprint.md` (layer diagram, worker contract),
> `regex-craft/docs/DESIGN.md` (Matchlight tokens), `ORCHESTRATION/BAR.md` §4–§5 (architecture,
> privacy), `regex-craft/app/tools/regex-craft/_hooks/useToolWorker.ts` (verbatim hook pattern).

---

## 1. Stack — and why each choice

| Layer | Choice | Reasoning |
|---|---|---|
| Framework | **Next.js 15 App Router** (`next ^15.5.x`) + React 19 | BAR §4.1 required; App Router lets the root page be a server `redirect()` with zero client JS; the tool route is one client page. |
| Language | **TypeScript `strict: true`**, `moduleResolution: "bundler"`, `paths: { "@/*": ["./*"] }` | The statistics core is numeric: `strict` + `noUncheckedIndexedAccess` catches off-by-one matrix indexing that a loose build would silently ship. |
| Styling | **Tailwind `^3.4.x`** + `tailwindcss-animate` + the **Matchlight token ladder verbatim** | Sibling parity; dual-theme by token flip; one lime accent reserved for the *measurement* (agreement / κ / the privacy promise). |
| State | **zustand `^5`** with `persist` + `partialize` | One store per concern; persisted content vs transient results (BAR §4.5). |
| Theming | **next-themes `^0.4`**, `storageKey="judgewright-theme"` | Per-tool key so siblings never collide; theme and content never merge. |
| Compute | **Web Worker** (`_workers/stats.worker.ts`) + `useJudgewrightWorker` | Bootstrap resampling and 100k-row parsing are seconds of work; the main thread must never freeze. |
| Tests | **vitest `^4`** (node env) for the pure core; **@playwright/test `^1.6x`** for journeys | Every statistic is golden-tested; e2e runs against the real standalone artifact. |
| Lint | **eslint `^9` flat** config with `@typescript-eslint/no-explicit-any: error` | BAR §6.2; separate `typecheck` script is mandatory. |
| Math deps | **none** (hand-rolled `mulberry32`, κ, α) | Determinism and auditability: one fixed arithmetic path, no library version drift, bundle stays inside budget, and the reproducibility receipt can print real formulas. |

**Why no math library:** the acceptance criteria require *byte-reproducible* numbers to 1e-12.
A dependency that changes its summation order across versions breaks reproducibility and
makes the receipt unverifiable. All hot loops are hand-written over typed arrays
(`Int32Array`/`Float64Array`) with the RNG advanced **inline** (no closure call per draw) —
that is what keeps 200k rows × B=500 at ~0.36 s (`PLAN.md` §Feasibility).

**No transcendentals (adjudicated rule, `AC-60`):** `_lib/` contains **no**
`Math.log`, `Math.pow`, `Math.exp`, `Math.sqrt`, `Math.sin`, `Math.cos`, `Math.atan` — every
value the core produces is `+`, `−`, `×`, `÷` of doubles, which is what makes 17-significant-digit
byte-reproducibility assertable. An eslint `no-restricted-properties` rule blocks those six
methods under `_lib/**` and the purity test fails the build if one appears.

**Compute-path split:** the worker and the synchronous fallback both call
`computeReport()` in `_lib/report.ts` — the single source of semantics (BAR §4.2).

---

## 2. Layer diagram

```
app/tools/judgewright/page.tsx        orchestration + layout composition (client)
  └── _hooks/useJudgewrightWorker.ts  worker lifecycle · debounce · watchdog · crash degrade · stale guard · honest fallback
        ├── _workers/stats.worker.ts  off-main-thread execution + report LRU (summary + display window)
        ├── _lib/report.ts            ★ single source of semantics (worker AND fallback call it)
        │     ├── _lib/parse.ts       pasted text → RawVerdict[] (+ typed, line-numbered issues)
        │     ├── _lib/csv.ts         RFC4180 tokenizer (quotes, embedded commas/newlines, CRLF)
        │     ├── _lib/labels.ts      alias table + vocabulary normalization + family rule
        │     ├── _lib/rng.ts         mulberry32 (seeded, inline-advance friendly)
        │     ├── _lib/limits.ts      every cap + tier constant (single import site)
        │     ├── _lib/confusionMatrix.ts  matrix + TPR/TNR/PPV/F1/FPR (binary + k-class, positiveClass)
        │     ├── _lib/cohensKappa.ts      unweighted (★ headline) / linear / quadratic + single guard
        │     ├── _lib/krippendorffAlpha.ts nominal / ordinal / interval + level guards
        │     ├── _lib/chanceBaseline.ts    always-majority baseline + analytic κ≡0 identity
        │     ├── _lib/bootstrapCI.ts       index-resampling percentile CI · bootstrapBundle · tiering
        │     ├── _lib/calibration.ts       ECE (width/freq) + Brier, positiveClass-aware, 2 score modes
        │     ├── _lib/grade.ts             A–F bands + Landis–Koch labels (unweighted κ only)
        │     ├── _lib/biasMetrics.ts       position / verbosity bias (or "not computable")
        │     └── _lib/reportRender.ts      markdown report · one-line verdict · JSONL export · receipt
        ├── _services/llmDiagnosis.ts  opt-in BYOK single call (injected fetch) — see BAR §8 note
        └── _store/useToolStore.ts     zustand result/state sink (atomic settle)
```

`_components/` may import `_lib` and `_store`, **never the reverse**. `_workers/` imports
**only** `_lib` and `_services`. `_lib` has no React, no DOM, no IO.

**BAR §8 exception (deliberate, documented in `AGENTS.md` so a Phase-4 auditor sees it is
intentional):** `llmDiagnosis` performs IO (one `fetch`), so it cannot live in `_lib/`. It
lives at **`_services/llmDiagnosis.ts`**, outside the pure core, taking every side effect as
an injected argument and unit-tested with a fake fetch. This is the *only* module outside
`_lib/` that the statistics pipeline touches, and the exception is stated in `AGENTS.md`,
in this diagram, and in `PLAN.md` §4 (B-app ownership).

---

## 3. `_lib/types.ts` — zero runtime imports

Houses the shared types **and the worker protocol** (BAR §4.7). Because it has no runtime
import, no UI module can accidentally bundle the statistics core.

```ts
// ── Input model ────────────────────────────────────────────────────────────
export interface RawVerdict {
  exampleId: string;
  judgeLabel: string;
  humanLabels: string[];          // ≥1; ≥2 enables the human ceiling
  judgeScore: number | null;      // confidence in [0,1]; out-of-range ⇒ null (never clamped)
  humanScore: number | null;
  judgeCritique: string | null;
  humanCritique: string | null;
  judgeInput: string | null;      // optional passthrough for the table + LLM
  judgeOutput: string | null;
  position: number | null;        // 0 | 1 — which slot the judge preferred
  preferredLonger: boolean | null;
  lineNumber: number;
}

export type ParseIssueClass =
  | "structure"        // bad JSON line, CSV field/header mismatch, single-column file
  | "missing-field"    // example_id / judge_label / human_label absent on a row
  | "bad-value"        // non-numeric or out-of-range score, non-string label
  | "vocabulary"       // two known label families in one column — hard error
  | "capacity"         // MAX_COLS / MAX_ROWS / MAX_INPUT_CHARS exceeded
  | "ambiguity";       // two distinct columns claim the same semantic slot

export interface ParseIssue { line: number; cls: ParseIssueClass; column?: string; reason: string; excerpt?: string; }

export type VerdictFormat = "jsonl" | "csv";

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
  issues: ParseIssue[];           // capped at the first 5 displayed, `issueCount` honest
  issueCount: number;
  format: VerdictFormat;
  rowCount: number;               // data rows seen before the cap (true total, kept honest)
  capped: boolean;                // rowCount > MAX_ROWS — capped BEFORE analysis
  columns: string[];
  mapping: ColumnMapping;
  warnings: string[];             // e.g. duplicate example_id notes, ordinal fallback notes
}

// ── Statistics ─────────────────────────────────────────────────────────────
export type KappaWeights = "unweighted" | "linear" | "quadratic";
export type AlphaLevel = "nominal" | "ordinal" | "interval";
export type BinMode = "width" | "freq";
export type JudgeScoreMode = "p-positive" | "confidence";   // never auto-detected

export interface ConfusionMatrix {
  labels: string[];               // sorted ascending
  matrix: number[][];             // [humanIndex][judgeIndex]
  rowTotals: number[];            // human marginals
  colTotals: number[];            // judge marginals
}

export interface BinaryMetrics {
  tp: number; fp: number; tn: number; fn: number;
  tpr: number | null; tnr: number | null; ppv: number | null;
  fpr: number | null; f1: number | null;
  positiveClass: string;          // echoed: the class tp/fn are measured against
}

export interface MulticlassMetrics {
  perLabel: Array<{ label: string; precision: number | null; recall: number | null; f1: number | null; support: number }>;
  macroPrecision: number | null; macroRecall: number | null; macroF1: number | null;
}

export interface ConfidenceInterval {
  point: number;
  low: number;
  high: number;
  replicates: number;             // the B actually used (tiered, honest)
  seed: number;
}

export interface ChanceBaseline {
  majorityClass: string;
  baselineAgreement: number;      // always-guess-majority agreement vs human labels
  baselineKappa: number;          // ≡ 0 by construction (analytic p_o = p_e identity, asserted)
  labelDistribution: Record<string, number>;
}

export interface CalibrationPanel {
  ece: number | null;
  brier: number | null;
  bins: number;
  mode: BinMode;
  scoreMode: JudgeScoreMode;      // echoed, user-selected
  positiveClass: string | null;   // the class the ECE/Brier outcome is measured against
  mismatchWarning: string | null; // AC-41 copy, or null
  ambiguousReason: string | null; // two columns mapped to judge_score ⇒ not computable
  scoreCount: number;             // rows that carried a usable judge_score
  computable: boolean;            // false ⇒ UI says "not computable from your input"
}

export interface BiasPanel {
  computable: boolean;
  missingColumns: string[];
  positionBias: number | null;    // P(first slot) − 0.5
  positionN: number;              // pairs that picked a side
  verbosityBias: number | null;   // P(judge prefers longer) − P(human prefers longer)
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

export interface DisagreementWindow {
  offset: number;
  rows: DisagreementRow[];        // ≤ MAX_TABLE_ROWS — the display slice only
  totalCount: number;             // the honest total (e.g. 200,000)
}

// ── Report ─────────────────────────────────────────────────────────────────
export interface ComputeOptions {
  seed: number;
  confidenceLevel: number;        // 0.95 default
  kappaWeights: KappaWeights;     // secondary-row selection only; default "unweighted".
                                  // The headline κ, the grade, the Δκ-deflation and the primary
                                  // κ CI are ALWAYS the unweighted κ, whatever this is set to.
  judgeScoreMode: JudgeScoreMode; // "p-positive" default; user-selected, never auto-detected
  positiveClass?: string;         // default = second sorted label
  labelOrder?: string[];          // explicit order for ordinal α on non-numeric labels
  alphaLevel: AlphaLevel;         // "nominal" default
  bins: number;                   // 10 default
  binMode: BinMode;               // "width" default
  deadlineMs?: number;            // cooperative budget (worker 1000, sync 800)
}

export interface CalibrationReport {
  n: number;
  labels: string[];
  binary: boolean;
  positiveClass: string | null;   // second sorted label by default, user-overridable
  accuracy: number;
  agreementRows: number;
  confusion: ConfusionMatrix;
  binaryMetrics: BinaryMetrics | null;
  multiclass: MulticlassMetrics | null;
  kappa: number | null;                     // ★ UNWEIGHTED — headline, grade, Δκ, primary CI
  kappaLinear: number | null;               // secondary, labelled row only
  kappaQuadratic: number | null;            // secondary, labelled row only
  kappaUndefinedReason: string | null;      // degenerate rater ⇒ null before either path
  alphaPanel: number | null;                // [judge, ...humanLabels] per row
  alphaHumans: number | null;               // human raters only — the human ceiling
  alphaLevel: AlphaLevel;
  alphaUndefinedReason: string | null;
  alphaWarning: string | null;              // e.g. ordinal fell back to nominal
  alphaReplicates: number | null;           // B_alpha actually used for α CIs (null if not computed)
  baseline: ChanceBaseline;
  deflation: number | null;                 // accuracy − kappa_unweighted (the Δκ headline)
  liftOverBaseline: number | null;          // accuracy − baselineAgreement
  ci: { accuracy: ConfidenceInterval | null; kappa: ConfidenceInterval | null; alpha: ConfidenceInterval | null };
  calibration: CalibrationPanel | null;
  bias: BiasPanel;
  grade: string;                            // "A".."F" or "—" (grade of UNWEIGHTED κ)
  gradeLabel: string;                       // Landis–Koch wording
  disagreements: DisagreementRow[];         // ALL rows (export carries all; UI caps display)
  receipt: string;                          // markdown: exact formula + inputs + receipt block
  executionTimeMs: number;
  bootstrapReplicates: number;              // the tier B actually used
  alphaBootstrapReplicates: number | null;  // α-specific tier when it applies
  ciDropped: boolean;                       // deadline aborted the CIs — visible in the receipt
  engine: "worker" | "main-thread";         // which path produced this report
  truncated: boolean;                       // rows > MAX_ROWS were capped
}

// ── LLM diagnosis ──────────────────────────────────────────────────────────
export interface DiagnosisDisagreement {
  id: string; input: string | null; output: string | null;
  humanLabel: string; humanCritique: string | null;
  judgeLabel: string; judgeCritique: string | null;
}
export interface DiagnosisRequest { rubric: string; disagreements: DiagnosisDisagreement[] }
export interface DiagnosisResult {
  rubricHoles: string[];
  biasFlags: string[];
  misapplications: string[];
  priorityFix: string;
}
export type DiagnosisErrorKind = "no-key" | "network" | "format" | "aborted";
export class DiagnosisError extends Error { constructor(kind: DiagnosisErrorKind, message: string) { super(message); this.kind = kind; } }

// ── Worker protocol ────────────────────────────────────────────────────────
// `id` monotonic: newest request wins. The heavy payload is SPLIT: the summary
// always ships; the disagreement rows ship as a display window only; the full
// set is pulled on demand for export / the LLM call.
export interface WorkerInputPayload {
  id: number;
  text: string;
  rubric: string;
  options: ComputeOptions;
}
export interface ReportSummary extends Omit<CalibrationReport, "disagreements"> {}
export interface WorkerOutputPayload {
  id: number;
  summary: ReportSummary;                 // all point statistics + capped arrays, always
  disagreements: DisagreementWindow;      // ≤ MAX_TABLE_ROWS rows + totalCount
  parseIssues: ParseIssue[];
  issueCount: number;
  format: VerdictFormat;
  capped: boolean;
  rowCount: number;
  error: string | null;                   // friendly, never a raw stack
  degraded: boolean;                      // produced on the sync fallback path
}
export interface WorkerDisagreementsRequest {
  id: number;
  offset: number;
  limit: number;
  purpose: "export" | "diagnosis";        // diagnosis ⇒ the 25 selected rows come back
}
export interface WorkerDisagreementsPayload {
  id: number;
  offset: number;
  rows: DisagreementRow[];                // the requested slice (paged to limit)
  totalCount: number;
  selection: DiagnosisDisagreement[] | null;  // set when purpose === "diagnosis"
}
```

---

## 4. Pure-core module map — exact boundaries and signatures

Every function below lives in `_lib/` (except `_services/llmDiagnosis.ts`, see the BAR §8
exception), is exported as a named function, takes plain data, returns plain data, and
throws nothing (errors are values, BAR §4.4).

```ts
// _lib/rng.ts — the single RNG. Inlined in hot loops; exported for tests.
export interface Rng { next(): number; seed(): number; }
export function mulberry32(seed: number): Rng;

// _lib/parse.ts
export function parseVerdicts(text: string): ParseResult;
export function detectFormat(text: string): VerdictFormat;         // "jsonl" | "csv"
export function mapColumns(header: string[]): ColumnMapping;        // alias table

// _lib/labels.ts
export function normalizeLabel(raw: string): string;                 // alias → canonical
export function knownFamilies(labels: string[]): string[];           // distinct known families present
export function isKnownVocabulary(labels: string[]): boolean;
// VALID iff fewer than TWO distinct known families are present. Unknown-but-consistent
// values are a legal label set; the hard error (FM-2) fires only on ≥2 known families.
export function vocabularyError(labels: string[]): string | null;    // exact FM-2 copy or null

// _lib/confusionMatrix.ts
export function confusionMatrix(judge: string[], human: string[]): ConfusionMatrix;
export function binaryMetrics(judge: string[], human: string[], positive: string): BinaryMetrics;
export function multiclassMetrics(m: ConfusionMatrix): MulticlassMetrics;

// _lib/cohensKappa.ts
export function cohensKappa(judge: string[], human: string[], weights?: KappaWeights): number | null;
export function kappaUndefinedReason(judge: string[], human: string[]): string | null;
// SINGLE GUARD, before either path: if either rater used fewer than 2 distinct labels the
// function returns null. That covers the S === n² one-label-per-rater case (the integer
// fast path would otherwise compute 0/0 = NaN) and the one-rater-constant case (where
// p_o ≡ p_e by construction, so the value would carry no information).

// _lib/krippendorffAlpha.ts
export interface AlphaResult { value: number | null; reason: string | null; warning: string | null; }
export function krippendorffAlpha(
  units: string[][], level?: AlphaLevel, labelOrder?: string[],
): AlphaResult;
// interval: ALL labels must parse as finite numbers, else value null + reason
//   "interval α needs numeric labels; use nominal".
// ordinal: numeric labels, OR an explicit labelOrder, else value = nominal + warning
//   "ordinal α needs numeric labels or an explicit labelOrder — falling back to nominal"
//   (never a silent alphabetical sort order).

// _lib/chanceBaseline.ts
export function chanceBaseline(judge: string[], human: string[]): ChanceBaseline;
// baselineKappa is the ANALYTIC identity: the always-majority dummy has p_o = p_e, so
// κ ≡ 0 exactly. It is NOT computed by routing the constant dummy through cohensKappa
// (which returns null for constant raters — see cohensKappa.ts).

// _lib/bootstrapCI.ts
export type StatFn = (sel: Int32Array, out: Float64Array) => number;

export function bootstrapCI(
  rows: { judgeIdx: Int32Array; humanIdx: Int32Array },
  stat: StatFn,
  opts: { seed: number; B: number; alpha?: number },
): ConfidenceInterval | null;
// `sel` is a resample of ROW INDICES drawn with replacement over examples (n draws);
// `out` is a scratch Float64Array the stat fills — no per-replicate allocation.
// resampleMean stays a MODULE-PRIVATE fast path for the accuracy statistic only.

export interface PanelCodes {           // encoded ONCE from the label pair arrays
  judgeIdx: Int32Array;                 // class code of the judge label, per row
  humanIdx: Int32Array;                 // class code of the FIRST human label, per row
  pairCode: Int32Array;                 // humanIdx[i] * classes + judgeIdx[i]
  labels: string[];                     // the sorted vocabulary — code ⇒ label
  classes: number;
}
export function encodePanel(judge: string[], human: string[]): PanelCodes;

export function bootstrapBundle(          // SHIPPED signature (D2)
  rows: PanelCodes,
  opts: { seed: number; B: number; alphaB?: number; alpha?: number;
          alphaLevel?: AlphaLevel; alphaOrder?: string[];
          deadlineAt?: number /* absolute Date.now() boundary */ },
): { accuracy: ConfidenceInterval | null; kappa: ConfidenceInterval | null;
     alpha: ConfidenceInterval | null; deadlineHit: boolean };
// ONE shared resample loop per replicate: a single RNG stream (mulberry32, inlined) and
// one fused draw+accumulate pass update accuracy + κ + α together (never three
// independent draws), each statistic derived from the replicate's class-pair counts —
// kappaFromPairCounts / alphaFromPairCounts — so a replicate never rebuilds labels.
// The report's bootstrap phase calls only this. alphaB = the α-specific tier (250 above
// 50,000 rows), disclosed as alphaReplicates (budget) and alphaBootstrapReplicates
// (consumed). The deadline is an ABSOLUTE timestamp; a trip returns nulls only.
// (`bootstrapCI(rows, stat, opts)` remains the reusable single-statistic form used by the
// AC-49 property checks, with an identity-selection point statistic.)
export function bootstrapTier(rowCount: number): number;             // deterministic B

// _lib/calibration.ts
export function ece(
  scores: Float64Array, judgeLabels: string[], positiveClass: string,
  opts?: { bins?: number; mode?: BinMode; scoreMode?: JudgeScoreMode },
): number | null;
export function brier(
  scores: Float64Array, judgeLabels: string[], positiveClass: string,
  opts?: { scoreMode?: JudgeScoreMode },
): number | null;
// Both take positiveClass and FLIP INTERNALLY:
//   p-positive: p = s,                       outcome = (judgeLabel === positiveClass)
//   confidence: p = judgeLabel ? s : 1 − s,  outcome = (judgeLabel === positiveClass)
// Score-mode auto-detection does not exist. The panel computes BOTH modes and, when the
// selected mode is "p-positive" and |ECE(p-positive) − ECE(confidence)| > 0.05, the panel
// surfaces mismatchWarning: "your scores look like confidences, not probabilities" (AC-41).

// _lib/grade.ts
export const GRADE_BANDS: readonly { min: number; grade: string; label: string }[];
export function letterGrade(kappa: number | null): string;           // applied to UNWEIGHTED κ
export function landisKochLabel(kappa: number | null): string;

// _lib/biasMetrics.ts
export function biasMetrics(rows: RawVerdict[]): BiasPanel;

// _lib/report.ts — ★ the single source of semantics
export function computeReport(rows: RawVerdict[], options: ComputeOptions): CalibrationReport;

// _lib/reportRender.ts
export function renderMarkdownReport(r: CalibrationReport, rubric: string): string;
export function renderOneLineVerdict(r: CalibrationReport): string;  // golden-tested, 17 sig figs
export function renderAgreementJsonl(r: CalibrationReport): string;
export function renderReceipt(r: CalibrationReport): string;         // includes {seed,B,deadlineMs,ciDropped,reason,engine}

// _services/llmDiagnosis.ts — every side effect injected; no fetch global at module scope.
// BAR §8 exception: IO lives outside _lib/ deliberately (documented in AGENTS.md).
export const DIAGNOSIS_DISAGREEMENT_LIMIT = 25;
export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export function selectDiagnosisDisagreements(r: CalibrationReport): DiagnosisDisagreement[];
// Deterministic selection: confusion cells ranked by frequency desc, then rows picked
// ROUND-ROBIN across distinct cells (one per cell at a time, highest-frequency cell
// first), ties by example_id asc — and the UI copy says so.
export function buildDiagnosisRequest(rubric: string, rows: DiagnosisDisagreement[]): DiagnosisRequest;
export async function llmDiagnosis(
  req: DiagnosisRequest,
  opts: { apiKey: string | null; model: string; fetchImpl?: typeof fetch; signal?: AbortSignal },
): Promise<DiagnosisResult>;
// An AbortError surfaces as DiagnosisError("aborted") and the panel returns to the
// configure-key state (AC-38).
export function isDiagnosisConfigured(apiKey: string | null): boolean;

// lib/utils.ts (outside _lib — a DOM utility, imported by _components only)
export async function copyTextToClipboard(text: string): Promise<boolean>;
// async Clipboard API → hidden-textarea execCommand fallback; resolves false on failure
// so the Toaster can show the rose state.
```

### Coefficient definitions as implemented (the audit contract)

- **Cohen's κ** (`cohensKappa.ts`): `κ = 1 − D_o/D_e` with the **disagreement-weight** form,
  `w_ii = 0`, `w_ij = |i−j|` (linear) or `|i−j|²` (quadratic) or `1` (unweighted). The
  unweighted path uses the **integer-rational fast path** `κ = (A·n − S)/(n² − S)` where
  `A = Σᵢ O_ii` and `S = Σᵢ rowᵢ·colᵢ` are exact integers, so the canonical examples land on
  the nearest double bit-for-bit. **The single degenerate guard runs first**: a rater with
  one distinct label ⇒ `null` (which is exactly the `S === n²` one-label-per-rater case the
  fast path cannot divide around).
- **Krippendorff's α** (`krippendorffAlpha.ts`): coincidence matrix `o` built from all
  within-unit unordered pairs, each weighted `1/(m_u − 1)`; expected
  `e_vv' = (n_v(n_v−1)|v=v' else n_v n_v')/(n−1)`; `α = 1 − Σ o δ / Σ e δ`. δ is
  `1` (nominal), `(v−v')²` (interval), `(Σ_{g=v}^{v'} n_g − (n_v+n_v')/2)²` (ordinal). Level
  guards: `interval` requires all-numeric labels (`null` + reason otherwise); `ordinal`
  requires numeric labels or an explicit `labelOrder` (nominal + warning otherwise).
- **Chance baseline**: `baselineAgreement = max_c count(human = c)/n`; the always-majority
  dummy judge has κ ≡ 0 **exactly** because its expected agreement equals its observed
  agreement (`p_o = p_e`, derived analytically and asserted at `AC-09`), which the tool prints
  so a κ near zero is understood as "indistinguishable from always-pass".
- **Δκ-deflation**: `deflation = accuracy − κ_unweighted` (percentage points when displayed).
- **Bootstrap**: percentile, index-resampling over examples, `B` from `bootstrapTier(rowCount)`
  (`bootstrapBundle` drives accuracy + κ + α from **one** draw), `mulberry32(seed)`. When the
  α-specific tier applies, `alphaB = min(B, 250)` above 50,000 rows and the report ships
  `alphaReplicates` / `alphaBootstrapReplicates` so the CI panel can name the rule.

---

## 5. Worker + hook contract — `_workers/stats.worker.ts` + `_hooks/useJudgewrightWorker.ts`

Mirrors RegexCraft's verbatim pattern, adapted because Judgewright's heavy work is
**resampling**, not catastrophic backtracking, and therefore *fully cooperative*.

```
monotonic id + stale guard   →  if (event.data.id < requestIdRef.current) return;
adaptive debounce (chars)    →  ≤5,000 → 0ms · >5,000 → 40ms · >20,000 → 120ms · >200,000 → 250ms
watchdog (hard wall)         →  1,500 ms → terminate + respawn + friendly error
crash degrade                →  onerror / onmessageerror / spawn failure ⇒ degradeToMainThread()
cooperative deadline (worker)→  1,000 ms checked at phase boundaries: parse → stats → bootstrap
sync fallback deadline       →    800 ms (stricter, protects UI frames)
announce debounce            →    800 ms trailing for successes; errors settle immediately
single degradation path      →  degradeToMainThread(): amber banner + same pure core
report LRU (worker)          →  32 entries, keyed by a text hash, recency refresh, only
                                 error-free + non-timed-out results are cached; each entry
                                 stores the SUMMARY + the display window, never the full
                                 disagreement array (it is recomputed on demand)
```

**Five operating rules (the contract, in full):**

1. **Two-phase compute inside one dispatch.** Phase A (parse → confusion → κ → α → baseline →
   grade → disagreements → bias) is always cheap (< 250 ms at 200k rows) and always runs.
   Phase B (bootstrap CIs via `bootstrapBundle`) is expensive and deadline-bounded. The
   worker returns **one** payload so the store settles atomically — and that payload is the
   **split** payload: `summary` (all point statistics + capped arrays) plus a `disagreements`
   **window** (`{offset, rows, totalCount}`, `rows` ≤ `MAX_TABLE_ROWS`). The full row set is
   never structured-cloned per dispatch; it is pulled on demand for export / the LLM call.
2. **`B` is a pure function of the row count — never of wall-clock.** Same rows ⇒ same `B` ⇒
   byte-identical CIs on every machine. The deadline may *abort* CIs (documented degradation,
   honest copy, `ci.* = null`, `ciDropped: true`, the receipt names the deadline); it never
   silently changes `B`.
3. **Worker deadline checks are amortized**, at phase boundaries and every 128 bootstrap
   replicates; the tier table is sized with ≥ 2.7× headroom so a machine 2.5× slower than the
   reference still finishes inside the budget (`PLAN.md` §Feasibility). The α-specific tier
   (`alphaB = min(B, 250)` above 50,000 rows) applies **only** if the §1.8 measurement shows
   α needs it, and is always disclosed via `alphaReplicates`.
4. **Watchdog ≠ deadline.** The 1.5 s watchdog protects against an unkillable hang (a bug, or
   an extension-hostile environment). `onerror` / `onmessageerror` catch a crashed or
   protocol-broken worker. Because phase B is cooperative, the deadline normally
   reports first; the watchdog and the crash handlers are the belt-and-braces paths and are
   unit-tested with fake timers and a fake worker (`AC-27`, `AC-31`).
5. **Honest fallback.** `onerror` / `onmessageerror` / watchdog / spawn failure all funnel
   through `degradeToMainThread()`, which runs the *same* `computeReport()` with
   `SYNC_DEADLINE_MS` and marks the report `degraded: true` (engine `"main-thread"`) so the
   UI can say *"computed on the main thread — CIs were capped"* rather than pretending.

### Caps & budgets (shared constants, all in `_lib/limits.ts`)

| Constant | Value | Why |
|---|---:|---|
| `MAX_ROWS` | 200,000 | above this the report is capped with an amber "showing first 200,000 of N" strip; the cap is applied **before** analysis and the true total is still counted |
| `MAX_COLS` | 64 | header sanity; more ⇒ parse error |
| `MAX_INPUT_CHARS` | 40,000,000 | 40 MB paste ceiling; beyond → clear error, nothing parsed |
| `BOOTSTRAP_B` | 2,000 (default) | default tier |
| `BOOTSTRAP_TIERS` | ≤50,000→2,000 · ≤100,000→1,000 · ≤150,000→500 · ≤200,000→500 | deterministic; measured 0.36 s worst case; monotonic non-increasing (asserted, AC-53) |
| `BOOTSTRAP_MIN_B` | 200 | lower bound so a CI is still reported |
| `BOOTSTRAP_ALPHA_B` | `min(B, 250)` above 50,000 rows | α-specific tier, applied only when the `PLAN.md` §1.8 measurement requires it; disclosed via `alphaReplicates` |
| `WORKER_DEADLINE_MS` | 1,000 | cooperative budget inside the worker |
| `SYNC_DEADLINE_MS` | 800 | stricter budget on the main thread |
| `WATCHDOG_MS` | 1,500 | hard wall-clock before terminate + respawn |
| `SUCCESS_ANNOUNCE_DEBOUNCE_MS` | 800 | collapse typing bursts into one SR update |
| `ARTIFACT_CACHE_CAPACITY` | 32 | LRU entries in the worker (summary + window only) |
| `MAX_TABLE_ROWS` | 2,000 | disagreement table display cap inside a virtualised window (export pulls all rows on demand) |
| `MAX_RUBRIC_CHARS` | 8,000 | rubric pane cap |
| `DIAGNOSIS_DISAGREEMENT_LIMIT` | 25 | rows sent to the single LLM call |
| Initial page JS | ≤ 200 kB | `context.md` §4.1 |
| Constants home | `_lib/limits.ts` | exactly one import site for every constant above (test asserts the tier table monotonicity) |

### Serialization note

The structured-clone hop ships the whole pasted text per dispatch. That is why the dispatch
slices to `MAX_INPUT_CHARS` *before* posting (mirroring RegexCraft's `truncateForDispatch`)
and why the debounce tiers are keyed on input length. On the **output** side the payload is
split (`summary` + `disagreements` window) precisely so a 200k-row run with critiques never
clones ~200k critique strings into the store in one hop — the full rows travel only when
export or the LLM flow asks for them, in the second message.

---

## 6. State — zustand split (`_store/useToolStore.ts`)

| Field | Kind | Notes |
|---|---|---|
| `verdictsText` | **persisted** | the pasted JSONL/CSV |
| `rubric` | **persisted** | optional rubric text |
| `settings` | **persisted** | `{ seed, confidenceLevel, kappaWeights, judgeScoreMode, positiveClass, labelOrder, alphaLevel, bins, binMode }` |
| `report` | transient | the settled summary (point stats + display window) |
| `disagreementWindow` | transient | `{offset, rows, totalCount}` for the table; full rows fetched on demand |
| `parseIssues`, `issueCount`, `format`, `rowCount` | transient | from the last parse |
| `isProcessing` | transient | pipeline busy |
| `errorMessage` | transient | friendly, `null` when clean; all-rows-invalid settles here with `report === null` |
| `isWorkerAvailable` | transient | `null` unknown → `true` worker → `false` degraded |
| `diagnosis` / `diagnosisState` | transient | `{ status: "idle" \| "configure-key" \| "loading" \| "ready" \| "error", result?, error? }` |
| `llmKey` | transient, **never persisted** | session-only, cleared on `purge` |
| filters (`disagreementFilter`, `alphaLevel` UI) | transient UI | disagreement table controls |
| `statusAnnouncement` | transient | `{ message, seq }`; `seq` re-keys identical text |

- Persist key **`judgewright-tool-storage`**, `version: 1`, `skipHydration: true`, explicit
  rehydrate on mount inside the hook, `partialize` limited to `{ verdictsText, rubric, settings }`.
- `merge()` is defensive: `settings: { ...DEFAULT_SETTINGS, ...(incoming.settings ?? {}) }`.
- **Atomic settle:** `applyComputation(result, { announce })` sets report + window + issues +
  error + announcement in **one** `set()`; consumers never see an intermediate frame.
- One store per concern: tool store + auth-prompt store (`_store/useAuthPromptStore.ts`).

## 7. Data flow

```
paste / drop verdicts ─┐
                        ├─► parseVerdicts(text) ─► RawVerdict[] + ParseIssue[]
rubric + settings ─────┘            │
                                     ▼
               useJudgewrightWorker (debounce → postMessage)
                                     ▼
               _workers/stats.worker.ts
                  computeReport(rows, options)     ← the only semantics
                    A: parse-validate → confusion → κ → α → baseline → grade → disagreements → bias
                    B: bootstrapBundle — one RNG stream, one index array per replicate
                                     ▼
               WorkerOutputPayload (id, summary, disagreements window, issues, error, degraded)
                                     ▼
               applyComputation()  ── atomic set ──► report card UI
                                     │
                                     ├─► export / LLM needs the full rows?
                                     │      └─► WorkerDisagreementsRequest (offset, limit, purpose)
                                     │           ◄── WorkerDisagreementsPayload (rows | 25-row selection)
                                     │
                                     └─► (opt-in, BYOK) llmDiagnosis() ─► diagnosis panel
                                     ▼
               export: markdown report · one-line verdict · agreement JSONL · receipt
```

**No payload leaves the browser** on the default path. The only outbound requests the product
can ever make are the single opt-in OpenRouter call and (when env-configured) Supabase OAuth.
Every `connect-src` origin is listed in the `DECLARED_ORIGINS` constant; a static test asserts
the CSP is a subset of that list and the runtime-observed origins are a subset too (`AC-20`).

## 8. Failure modes — graceful behavior, each with user-facing copy

| # | Failure | Detection | Graceful behavior | Copy (verbatim) |
|---|---|---|---|---|
| FM-1 | Malformed row | row fails validation | Row dropped; first 5 issues listed with line, class + reason; report still computes from valid rows; amber strip | "Line 42: missing \"example_id\" — 3 rows skipped, report computed from 997." |
| FM-2 | Mixed label vocabularies | ≥ 2 known families in one label column | Hard error, no report, offending set listed | "Labels {PASS, FAIL, TRUE} mix two vocabularies — normalize before comparing. Known aliases: pass/fail, yes/no, true/false, 1/0." |
| FM-3 | Missing numeric columns for ECE/Brier | `judgeScore` absent on all rows | `calibration.computable = false`; panels render the reason; no fabricated 0 | "Not computable from your input — add judge_score in [0,1] to unlock ECE and Brier." |
| FM-4 | κ undefined (degenerate rater) | the single `cohensKappa` guard | `kappa = null`, `grade = "—"`, headline shows the reason; Δ and CIs for κ are `null` | "κ is undefined: no label variance to correct for. Report accuracy instead." |
| FM-5 | > 200,000 rows | `rowCount > MAX_ROWS` | Capped **before** analysis; first `MAX_ROWS` analyzed; amber strip shows the true total; export carries only the analyzed rows | "Results capped at 200,000 of 1,000,000 rows." |
| FM-6 | Worker crash (`onerror` / `onmessageerror`) / structured-clone failure / watchdog / spawn failure | hook handlers | `degradeToMainThread()`: terminate, respawn once, amber banner, same core on the main thread, report flagged `degraded`, engine `"main-thread"` | "Worker unavailable — computing on the main thread (same core, CIs capped)." |
| FM-7 | Bootstrap deadline trips | cooperative deadline | Phase A already settled; `ci.* = null` with `ciDropped: true`; point statistics unchanged; the receipt names the deadline | "Bootstrap CIs omitted — the deadline was reached. Point statistics are unaffected." |
| FM-8 | LLM key present, 4xx/5xx | `fetch` resolves non-2xx | `DiagnosisError("network")`, no retry, no persistence, panel stays interactive, key kept in memory only | "Diagnosis failed (HTTP 429). Nothing was stored; retry when ready." |
| FM-9 | LLM disabled (no key) | `llmKey == null` | Panel is a no-op; **zero** network calls; every deterministic feature fully functional | "Configure a key to run the diagnosis — nothing is sent anywhere until you do." |
| FM-10 | Nonconforming LLM JSON | response fails validation | `DiagnosisError("format")` with the offending field; the raw text is never stored | "The model returned an unexpected shape (missing priority_fix). Nothing was stored." |
| FM-11 | Empty or whitespace input | text trims to empty | Seeded first-run dataset loads so the instrument is never blank | "Loaded the demo dataset — paste your own verdicts to replace it." |
| FM-12 | < 2 pairable values for α | pairable `n < 2` | `alphaPanel = null`, `alphaUndefinedReason` set, α panel explains | "α needs at least two coders on at least two examples." |
| FM-13 | Bias columns absent | `position`/`preferredLonger` missing | Bias panel lists the missing columns instead of guessing | "Not computable from your input — add position (0/1) and/or preferred_longer." |
| FM-14 | Only one critic's labels | `humanLabels.length === 1` everywhere | α still computed over `[judge, human]` with the 2-coder disclosure; human ceiling reported as unavailable | "Human ceiling needs ≥2 human raters per example." |
| FM-15 | Ambiguous score column | two distinct columns map to `judge_score` | Warning on the parse; calibration panel not computable; the rest of the report computes normally | "Not computable from your input — two columns map to judge_score; rename one." |
| FM-16 | Duplicate `example_id` | dup detection at parse | Both rows kept and counted as independent examples; warning lists the ids | "duplicate example_id \"X42\" — rows are counted independently" (first 5 ids listed) |
| FM-17 | Every row invalid (non-empty input) | zero valid rows after parse | **`report === null`** — no zero-filled report; error envelope settles atomically | "No usable rows — every row failed validation. Fix the first issue and try again." |
| FM-18 | LLM request aborted mid-flight | `AbortError` | `DiagnosisError("aborted")`; panel returns to the configure-key state; key stays in memory only | "Diagnosis aborted — nothing was sent or stored." |

## 9. Privacy & security posture

- **CSP** (BAR §5.1 verbatim, `connect-src` widened by exactly the origins in
  `DECLARED_ORIGINS`):
  `default-src 'self'; script-src 'self' 'unsafe-inline'` (+ `'unsafe-eval'` **dev only**);
  `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob: https://*.googleusercontent.com
  https://avatars.githubusercontent.com https://*.githubusercontent.com`;
  `font-src 'self' data:`; **`connect-src 'self' https://*.supabase.co wss://*.supabase.co
  https://openrouter.ai`**; `worker-src 'self' blob:`; `frame-ancestors 'none'`; `base-uri 'self'`;
  `form-action 'self'`; `object-src 'none'`. HSTS, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, `poweredByHeader: false`.
- **`DECLARED_ORIGINS`** is the single documented list of every origin that may appear in
  `connect-src` (`'self'` / same-origin, `https://*.supabase.co`, `wss://*.supabase.co`,
  `https://openrouter.ai`). A **static** test parses the shipped CSP and fails if any origin
  is outside the list; the Playwright guard asserts the runtime-observed origins are a
  subset of it (`AC-20`).
- **Zero-egress is a test** (`AC-20`): the Playwright allow-list is derived from the same
  constant that builds `connect-src`, so a new origin without a CSP change fails CI.
- **E2E env is pinned empty**: `playwright.config.ts` sets
  `NEXT_PUBLIC_SUPABASE_URL=""` and `NEXT_PUBLIC_SUPABASE_ANON_KEY=""` so the Supabase
  client is a `null` no-op and no Supabase origin is ever observed; `.env.example` notes this.
- **BYOK key handling**: session memory only; never persisted, never logged, never in a URL,
  cleared by the `Purge` action; the request body is never written to the store.
- **Auth is env-gated no-op** (BAR §5.3): singleton-promise client, lazy SDK import,
  `null` when keys absent; `shouldPromptSignIn` pure and unit-tested; core features never gated.

## 10. File tree (what the build must produce)

```
app/tools/judgewright/
  page.tsx                       orchestration + layout (client) — mounts Toaster globally
  _components/                   SiteHeader.tsx, TopToolbar.tsx, StationHeader.tsx,
                                 MainWorkspacePane.tsx, ReportCardPane.tsx, HeadlineCard.tsx,
                                 ConfusionHeatTable.tsx, DisagreementTable.tsx,
                                 BiasPanel.tsx, AlphaPanel.tsx, CalibrationPanel.tsx,
                                 DiagnosisPanel.tsx, ExportBar.tsx, CompetitorMatrix.tsx,
                                 KnowledgeHub.tsx, FaqSection.tsx, StudioFooter.tsx,
                                 CommandPalette.tsx, SignInModal.tsx, Toaster.tsx,
                                 StatusLiveRegion.tsx, ThemeToggle.tsx, auth/, providers/, ui/
  _hooks/                        useJudgewrightWorker.ts, useKeyboardShortcuts.ts, useAuth.ts
  _lib/                          types.ts, report.ts, parse.ts, csv.ts, labels.ts, rng.ts,
                                 confusionMatrix.ts, cohensKappa.ts, krippendorffAlpha.ts,
                                 chanceBaseline.ts, bootstrapCI.ts, calibration.ts, grade.ts,
                                 biasMetrics.ts, reportRender.ts, presets.ts,
                                 guide.ts, faq.ts, authGate.ts, supabaseClient.ts, limits.ts,
                                 __tests__/
  _services/                     llmDiagnosis.ts (BAR §8 exception — the only IO module)
  _store/                        useToolStore.ts, useAuthPromptStore.ts
  _workers/                      stats.worker.ts
  __tests__/                     (component catalog suites, e.g. uikit.test.ts)
lib/utils.ts                     copyTextToClipboard (async Clipboard → execCommand fallback)
app/sitemap.ts                   generated from metadataBase
app/robots.ts                    generated from metadataBase
scripts/oracle.mjs               node-side differential oracle (regenerates fixtures)
scripts/oracle.py                pinned scikit-learn oracle (regenerates fixtures)
fixtures/oracle-*.json           regenerated by `npm run oracle`; diffed in a CI job
e2e/                             smoke, demos, disagreements, perf, visual, copy
```

## 11. Decision log (for this artifact)

1. **Grade from unweighted κ, always** — one letter so the headline is unambiguous. The bands
   are the **Landis–Koch convention applied to unweighted κ**, the label prints next to the
   letter, and the UI carries the line *"bands are a convention — the numbers are the
   product"*. Weighted-linear/quadratic κ exist only as a labelled secondary row; they never
   feed the grade, the deflation or the CI (`AC-39`).
2. **α over the panel `[judge, human₁, …]`** — **adjudicated: ship as designed.** The panel α
   is computable on every dataset and the human-ceiling α (`alphaHumans`, human raters only)
   is the natural second figure; the judge is **not** dropped from the panel. What makes this
   honest is the mandatory disclosure copy + the κ-bands label of `AC-50`.
3. **CIs on agreement / unweighted κ / α only** — ECE, Brier and per-class metrics are point
   estimates, labelled as such. Statistically honest and inside the worker budget.
4. **Weighted κ defaults to unweighted** (revised from linear): the headline number must be
   the chance-corrected figure a reviewer can recompute from the 2×2 alone; the weighted rows
   are one click away and labelled secondary.
5. **Tiered, deterministic `B`** rather than a wall-clock-adaptive `B` — reproducibility beats
   squeezing a few more replicates out of a fast machine. The α-specific tier exists only if
   the `PLAN.md` §1.8 measurement requires it, and is disclosed (`alphaReplicates`).
6. **LLM diagnosis is one call, and its send button is the only thing that constructs the
   payload** — the report never auto-bundles user data for a model.
7. **`judge_score` has two explicit modes and no auto-detect** — `p-positive` (default) vs
   `confidence`, user-selected; ambiguity (two columns claiming the score slot) ⇒ the
   calibration panel is *not computable* with its own copy; the mismatch detector surfaces
   *"your scores look like confidences, not probabilities"* when the modes diverge
   (`AC-40`, `AC-41`).
8. **`positiveClass` is explicit** — default = second sorted label, user-selectable in one
   click, echoed in the confusion-matrix header and the receipt (`AC-51`).
9. **No transcendentals in `_lib/`** — no `Math.log/pow/exp/sqrt/sin/cos/atan`; eslint rule +
   purity test (`AC-60`).
10. **Label vocabulary** — unknown-but-consistent values are a legal label set; the hard
    error fires only when two values normalize into two different known families (`AC-46`…
    `AC-48`).
11. **Float tolerance** — 1e-12 against external references; bit-exactness for Judgewright's
    own outputs (17 significant digits, byte-comparable across processes).
12. **Deadline abort is permanent policy** — the deadline may abort CIs; it never changes a
    number. The abort is visible: `ciDropped`, the receipt reason, the deadline value
    (`AC-52`).
13. **`llmDiagnosis` lives in `_services/`, not `_lib/`** — a deliberate BAR §8 exception,
    documented in `AGENTS.md` so the Phase-4 auditor sees it is intentional.
