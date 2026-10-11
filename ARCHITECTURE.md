# Judgewright — ARCHITECTURE (shipped)

> **Status:** SHIPPED ARCHITECTURE, reconciled against the code at commit `3beea5e`
> (branch `main`). This document describes what the product **does** today. Where an
> earlier planning revision of this file described something that was never built, it has
> been corrected rather than kept.
>
> **Canonical references:** [`AGENTS.md`](./AGENTS.md) (binding axioms),
> [`README.md`](./README.md) (product surface), [`BENCHMARKS.md`](./BENCHMARKS.md)
> (measured numbers, `npm run bench`), [`QUALITY_REPORT.md`](./QUALITY_REPORT.md)
> (gates + known gaps), [`docs/blueprint.md`](docs/blueprint.md) (surface brief).

---

## 1. Stack — and why each choice

| Layer | Choice | Reasoning |
|---|---|---|
| Framework | **Next.js 15 App Router** (`next ^15.5.x`) + React 19 | App Router lets the root page be a server `redirect()` with zero client JS; the tool route is one client page. |
| Language | **TypeScript `strict: true`**, `moduleResolution: "bundler"`, `paths: { "@/*": ["./*"] }`, `allowImportingTsExtensions` | The statistics core is numeric: `strict` catches off-by-one matrix indexing that a loose build would silently ship. `allowImportingTsExtensions` exists because the cross-process reproducibility entries are run by `node --experimental-strip-types`, which resolves only fully-specified specifiers. |
| Styling | **Tailwind `^3.4.x`** + `tailwindcss-animate` + the **Matchlight token ladder verbatim** | Sibling parity; dual-theme by token flip; one lime accent reserved for the *measurement* (agreement / κ / the privacy promise). |
| State | **zustand `^5`** with `persist` + `partialize` | One store per concern; persisted content vs transient results. |
| Theming | **next-themes `^0.4`**, `storageKey="judgewright-theme"` | Per-tool key so siblings never collide; theme and content never merge. |
| Compute | **Web Worker** (`_workers/compute.worker.ts`) + `useToolWorker` | Bootstrap resampling and 200k-row parsing are up to ~1.5 s of work; the main thread must never freeze. |
| Tests | **vitest `^4`** (node env) for the pure core; **@playwright/test `^1.6x`** for journeys | Every statistic is golden-tested; e2e runs against the real standalone artifact on 3005. |
| Lint | **eslint `^9` flat** config with `@typescript-eslint/no-explicit-any: error` and a `no-restricted-properties` rule blocking the transcendals under `_lib/**` | BAR §6.2; separate `typecheck` script is mandatory. |
| Bench | **tsx `4.23.15`** (devDependency) | Runs `scripts/bench.ts` against the real `_lib` modules with no bundler, so a documented number cannot drift from shipped code. |
| Math deps | **none** (hand-rolled `mulberry32`, κ, α) | Determinism and auditability: one fixed arithmetic path, no library version drift, bundle stays inside budget, and the reproducibility receipt can print real formulas. |

**Why no math library:** the acceptance criteria require *byte-reproducible* numbers to 1e-12.
A dependency that changes its summation order across versions breaks reproducibility and
makes the receipt unverifiable. All hot loops are hand-written over typed arrays
(`Int32Array`/`Float64Array`) with the RNG advanced **inline** (no closure call per draw).

**Measured, not estimated:** `npm run bench` records the full 200k-row dispatch at a median of
**1,011 ms** (narrow payload) and **1,361 ms** (wide payload) against an **8,000 ms** watchdog
tier, with the parse the dominant cost (471 ms / 702 ms). See
[`BENCHMARKS.md`](./BENCHMARKS.md) — those numbers replace the planning estimates this
section used to carry.

**No transcendentals (adjudicated rule, `AC-60`):** `_lib/` contains **no**
`Math.log`, `Math.pow`, `Math.exp`, `Math.sqrt`, `Math.sin`, `Math.cos`, `Math.atan` — every
value the core produces is `+`, `−`, `×`, `÷` of doubles, which is what makes
17-significant-digit byte-reproducibility assertable. The eslint rule blocks those six
methods under `_lib/**` and `_lib/__tests__/purity.test.ts` fails the suite if one appears.

**Compute-path split:** the worker and the synchronous fallback both call
`analyzeVerdicts()` → `computeReport()` in `_lib/` — the single source of semantics
(BAR §4.2).

---

## 2. Layer diagram

```
app/tools/judgewright/page.tsx        orchestration + layout composition (client)
  └── _hooks/useToolWorker.ts         worker lifecycle · debounce · tiered watchdog ·
                                      crash degrade · stale guard · honest fallback
        ├── _workers/compute.worker.ts  off-main-thread execution + artifact LRU + stale guard
        ├── _lib/analyze.ts           ★ the ONE pipeline seam both engines call
        │     ├── _lib/parse.ts       pasted text → RawVerdict[] (+ typed, line-numbered issues)
        │     ├── _lib/csv.ts         RFC4180 tokenizer (quotes, embedded commas/newlines, CRLF, BOM)
        │     ├── _lib/labels.ts      alias table + vocabulary normalization + family rule
        │     ├── _lib/constants.ts   every cap + budget + tier constant (single import site)
        │     ├── _lib/types.ts       shared types + worker protocol (zero runtime imports)
        │     └── _lib/report.ts      computeReport — single source of semantics
        │           ├── _lib/confusionMatrix.ts   matrix + TPR/TNR/PPV/F1/FPR (binary + k-class)
        │           ├── _lib/cohensKappa.ts       unweighted (★ headline) / linear / quadratic + single guard
        │           ├── _lib/krippendorffAlpha.ts nominal / ordinal / interval + level guards
        │           ├── _lib/chanceBaseline.ts    always-majority baseline + analytic κ≡0 identity
        │           ├── _lib/bootstrapCI.ts       mulberry32 · index-resampling percentile CIs · tiering
        │           ├── _lib/calibration.ts       ECE (width/freq) + Brier, positiveClass-aware, 2 score modes
        │           ├── _lib/grade.ts             A–F bands + Landis–Koch labels (unweighted κ only)
        │           ├── _lib/biasMetrics.ts       position / verbosity bias (or "not computable")
        │           ├── _lib/disagreements.ts     per-example rows + the MAX_TABLE_ROWS display window
        │           └── _lib/reportRender.ts      markdown report · one-line verdict · JSONL export · receipt
        ├── _services/llmDiagnosis.ts opt-in BYOK single call (injected fetch) — BAR §8 exception
        └── _store/useToolStore.ts    zustand result/state sink (atomic settle)
```

`mulberry32` lives in `_lib/bootstrapCI.ts` (it is the bootstrap's RNG); there is no
`_lib/rng.ts` and no `_lib/limits.ts` — the cap/budget home is `_lib/constants.ts`.
`_components/` may import `_lib` and `_store`, **never the reverse**. `_workers/` imports
**only** `_lib`. `_lib` has no React, no DOM, no IO.

**BAR §8 exception (deliberate, documented in `AGENTS.md` so a Phase-4 auditor sees it is
intentional):** `llmDiagnosis` performs IO (one `fetch`), so it cannot live in `_lib/`. It
lives at **`_services/llmDiagnosis.ts`**, outside the pure core, taking every side effect as
an injected argument and unit-tested with a fake fetch. It is the only module in the tool
that performs network IO, it is off by default (`AUTO_DIAGNOSIS_ENABLED === false`), it
never feeds a number back into the report, and the key never enters any store snapshot.

---

## 3. `_lib/types.ts` — zero runtime imports

Houses the shared types **and the worker protocol** (BAR §4.7). Because it has no runtime
import, no UI module can accidentally bundle the statistics core. (`types.ts` is *types
only*; the `_services` diagnosis types live beside the service that owns them.)

**Input model**

```ts
export interface RawVerdict {
  exampleId: string;
  judgeLabel: string;
  humanLabels: string[];          // ≥1; ≥2 enables the human ceiling
  judgeScore: number | null;      // confidence in [0,1]; out-of-range ⇒ null (never clamped)
  humanScore: number | null;
  judgeCritique: string | null;
  humanCritique: string | null;
  judgeInput: string | null;      // optional passthrough for the table + the LLM call
  judgeOutput: string | null;
  position: number | null;        // 0 | 1 — which slot the judge preferred
  preferredLonger: boolean | null;
  lineNumber: number;             // the honest origin
}

export type ParseIssueClass = "structure" | "missing-field" | "bad-value"
  | "vocabulary" | "capacity" | "ambiguity";

export interface ParseIssue { line: number; cls: ParseIssueClass; column?: string; reason: string; excerpt?: string; }

export interface ParseOptions {          // A10: the parse budget, optional everywhere
  deadlineAt?: number;                   // ABSOLUTE Date.now() boundary
  budgetMs?: number;                     // carried only so the error copy can name it
}

/** Persisted settings — exactly what `partialize` writes. */
export interface JudgewrightSettings {
  seed: number;
  confidenceLevel: number;
  judgeScoreMode: JudgeScoreMode;        // "p-positive" | "confidence" — user-selected, never auto-detected
  positiveClass?: string;
  labelOrder?: string[];                 // explicit rank order for ordinal α
}
```

**Statistics**

```ts
export interface ConfusionMatrix { labels: string[]; matrix: number[][]; rowTotals: number[]; colTotals: number[]; }

export interface BinaryMetrics {
  tp: number; fp: number; tn: number; fn: number;
  tpr: number | null; tnr: number | null; ppv: number | null; fpr: number | null; f1: number | null;
  positiveClass: string;                 // echoed: the class tp/fn are measured against
}

export interface MulticlassMetrics {
  perLabel: Array<{ label: string; precision: number | null; recall: number | null; f1: number | null; support: number }>;
  macroPrecision: number | null; macroRecall: number | null; macroF1: number | null;
}

export interface ConfidenceInterval { point: number; low: number; high: number; replicates: number; seed: number; }

export interface ChanceBaseline {
  majorityClass: string;
  baselineAgreement: number;             // always-guess-majority agreement vs the human labels
  baselineKappa: number;                 // ≡ 0 by construction (analytic p_o = p_e identity, asserted at AC-09)
  labelDistribution: Record<string, number>;
}

export interface CalibrationPanel {
  ece: number | null; brier: number | null;
  bins: number; mode: BinMode; scoreMode: JudgeScoreMode;
  positiveClass: string | null;
  mismatchWarning: string | null;        // AC-41 copy, or null
  ambiguousReason: string | null;        // two columns mapped to judge_score ⇒ not computable
  reason: string | null;                 // the honest not-computable reason (FM-3/FM-12)
  scoreCount: number;
  computable: boolean;                   // false ⇒ the UI says "not computable from your input"
}

export interface BiasPanel {
  computable: boolean;
  missingColumns: string[];
  positionBias: number | null;           // P(first slot) − 0.5
  positionN: number;
  verbosityBias: number | null;          // P(preferred answer was longer) − 0.5
  verbosityN: number;
  note: string;
}

export interface DisagreementRow {
  exampleId: string; humanLabel: string; humanLabels: string[]; judgeLabel: string; agree: boolean;
  judgeScore: number | null; humanScore: number | null;
  judgeCritique: string | null; humanCritique: string | null;
  judgeInput: string | null; judgeOutput: string | null; lineNumber: number;
}

export interface DisagreementWindow { offset: number; rows: DisagreementRow[]; totalCount: number; }
```

**Report and options** — every field a milestone owns is filled and `null`-able rather than
faked. Note what is *optional* in `ComputeOptions`: the α level, the ECE binning and the
weighted selection are all accepted by the engine and left unset by the UI (see
[Known gaps](./QUALITY_REPORT.md#known-gaps-honest-list)).

```ts
export interface ComputeOptions {
  seed: number;
  confidenceLevel: number;
  positiveClass?: string;                // default = second sorted label
  kappaWeights?: KappaWeights;          // secondary-row selection only; default "unweighted"
  alphaLevel?: AlphaLevel;               // default "nominal"
  labelOrder?: string[];                 // explicit rank order for ordinal α
  judgeScoreMode?: JudgeScoreMode;       // default "p-positive"
  bins?: number;                         // default 10
  binMode?: BinMode;                     // default "width"
  judgeScoreAmbiguous?: boolean;         // A12: duplicated judge_score column ⇒ not computable
  truncated?: boolean;                   // parse-derived: rowCount > MAX_ROWS was capped
  rowCount?: number;                     // parse-derived: the true total before the cap
  deadlineMs?: number;                   // worker 1,000 · sync 800
  deadlineAt?: number;                   // A2: the ABSOLUTE boundary, covers the parse too
  engine?: ComputeEngine;                // "worker" | "main-thread"
}

export interface CalibrationReport {
  n: number;                             // analyzed rows (≤ MAX_ROWS)
  rowCount: number;                      // rows seen before the cap — always honest
  labels: string[];
  binary: boolean;
  positiveClass: string | null;
  accuracy: number;
  rawAgreement: number;                  // the same exact-match figure, under its metric name
  agreementRows: number;                 // agreeing rows within the analyzed set
  agreementTotal: number;                // A3: the TRUE full-set counts the export prints
  disagreementTotal: number;             //     (never a window count printed as a total)
  confusion: ConfusionMatrix;
  binaryMetrics: BinaryMetrics | null;
  multiclass: MulticlassMetrics | null;
  kappa: number | null;                  // ★ UNWEIGHTED — headline, grade, Δκ, primary CI
  kappaLinear: number | null;            // secondary, labelled row only
  kappaQuadratic: number | null;
  kappaUndefinedReason: string | null;
  alphaPanel: number | null;             // [judge, ...humanLabels] per row
  alphaHumans: number | null;            // human raters only — the human ceiling
  alphaLevel: AlphaLevel;                // echoed, so the pane names the level it used
  alphaUndefinedReason: string | null;
  alphaWarning: string | null;           // e.g. ordinal fell back to nominal
  alphaReplicates: number | null;        // the α tier the rule applied
  baseline: ChanceBaseline;
  deflation: number | null;              // accuracy − kappa_unweighted (the Δκ headline)
  liftOverBaseline: number | null;       // accuracy − baselineAgreement
  ci: { accuracy: ConfidenceInterval | null; kappa: ConfidenceInterval | null; alpha: ConfidenceInterval | null };
  calibration: CalibrationPanel | null;
  bias: BiasPanel;
  grade: string;                         // "A".."F" or "—" (grade of UNWEIGHTED κ)
  gradeLabel: string;                    // Landis–Koch wording
  disagreements: DisagreementRow[];      // the pure core fills ALL analyzed rows;
                                         // the payload ships the first MAX_TABLE_ROWS
  receipt: string;                       // exact formula + inputs + the receipt block
  executionTimeMs: number;
  bootstrapReplicates: number;           // the tier B actually used
  alphaBootstrapReplicates: number | null;  // the count the α CI really consumed
  ciDropped: boolean;                    // the deadline aborted the CIs — visible in the receipt
  engine: ComputeEngine;
  truncated: boolean;
}
```

**Worker protocol** — one message per dispatch. The reply carries the settled analysis (with
its disagreement window already sliced), the parse issues and the honest `issueCount`;
`ok`/`error` are values, never throws.

```ts
export interface WorkerInputPayload {
  id: number;                            // monotonic: the newest request wins
  verdictsText: string;
  rubric: string;
  settings: JudgewrightSettings;
}

export interface WorkerOutputPayload {
  id: number;
  ok: boolean;
  error: string | null;                  // friendly, never a raw stack
  degraded: boolean;                     // produced on the sync main-thread fallback
  stats: VerdictAnalysis | null;
  issues: ParseIssue[];                  // first MAX_PARSE_ISSUES
  issueCount: number;                    // the honest total
  disagreementWindow: DisagreementWindow;// offset 0 · ≤ MAX_TABLE_ROWS rows · totalCount = n
}
```

`VerdictAnalysis` bundles the settled report with the parse summary and the whole-paste
counts (`characterCount` / `wordCount` / `byteCount` / `lineCount` are honest about the whole
paste even when the report only covers the valid rows). `AnalysisOutcome` is the
discriminated union `{ok:true, stats} | {ok:false, error, issues, issueCount}`, and
`ComputationResult` is the subset the hot path settles in one atomic `set()`.

> **Removed from the planning revision (never shipped):** a second worker message pair
> (`WorkerDisagreementsRequest` / `WorkerDisagreementsPayload`) that was supposed to page the
> full row set out of the worker on demand. The shipped worker handles exactly one message
> shape; the export and the diagnosis read the windowed report the settle already carries, and
> the true totals ride beside it. Claiming the paging protocol would be claiming an artifact
> that does not exist.

---

## 4. Pure-core module map — exact boundaries and signatures

Every function below lives in `_lib/` (except `_services/llmDiagnosis.ts`, the BAR §8
exception), is exported as a named function, takes plain data, returns plain data, and
throws nothing (errors are values, BAR §4.4).

```ts
// _lib/parse.ts
export function parseVerdicts(text: string, options?: ParseOptions): ParseResult;
export function detectFormat(text: string): VerdictFormat;          // "jsonl" | "csv"
export function mapColumns(header: readonly string[]): ColumnMapping;  // alias table
export function columnAmbiguities(header: readonly string[]): { slot: keyof ColumnMapping; columns: string[] }[];

// _lib/labels.ts — unknown-but-consistent values are a legal label set; the hard error
// (FM-2) fires only on ≥2 distinct KNOWN families (PASS+TRUE, 0+NO, PASS+1…).

// _lib/confusionMatrix.ts — rows = HUMAN, columns = JUDGE, both sorted ascending
export function confusionMatrix(judge: string[], human: string[]): ConfusionMatrix;
export function binaryMetrics(judge: string[], human: string[], positive: string): BinaryMetrics;
export function multiclassMetrics(m: ConfusionMatrix): MulticlassMetrics;
export function defaultPositiveClass(judge: string[], human: string[]): string;   // 2nd sorted label

// _lib/cohensKappa.ts — SINGLE GUARD, before either path: a rater with fewer than 2
// distinct labels ⇒ null (covers both the S === n² integer case and the one-rater-constant
// case where p_o ≡ p_e by construction).
export function cohensKappa(judge: string[], human: string[], weights?: KappaWeights): number | null;
export function kappaUndefinedReason(judge: string[], human: string[]): string | null;
export function kappaReceiptInputs(judge: string[], human: string[]):
  { n: number; a: number; s: number; numerator: number; denominator: number } | null;
export function kappaFromPairCounts(counts: Int32Array, classes: number): number | null;

// _lib/krippendorffAlpha.ts
export interface AlphaResult { value: number | null; reason: string | null; warning: string | null; }
export function krippendorffAlpha(units: string[][], level?: AlphaLevel, labelOrder?: string[]): AlphaResult;
// interval: ALL labels must parse as finite numbers, else value null + reason
//   "interval α needs numeric labels; use nominal".
// ordinal: numeric labels OR an explicit labelOrder, else value = nominal + warning
//   "ordinal α needs numeric labels or an explicit labelOrder — falling back to nominal"
//   (never a silent alphabetical order).

// _lib/chanceBaseline.ts — baselineKappa is the ANALYTIC identity (p_o = p_e ⇒ κ ≡ 0),
// NOT the constant dummy routed through cohensKappa (which returns null by design).
export function chanceBaseline(judge: string[], human: string[]): ChanceBaseline;

// _lib/bootstrapCI.ts — mulberry32 lives here; it is the bootstrap's RNG.
export function mulberry32(seed: number): () => number;
export type StatFn = (selection: Int32Array, scratch: Float64Array) => number | null;
export function bootstrapCI(panel: PanelCodes, stat: StatFn, opts: {
  seed: number; B: number; alpha?: number; deadlineAt?: number;
}): ConfidenceInterval | null;
export interface PanelCodes {
  judgeIdx: Int32Array; humanIdx: Int32Array; pairCode: Int32Array; labels: string[]; classes: number;
}
export function encodePanel(judge: string[], human: string[]): PanelCodes;
export function bootstrapTier(rowCount: number): number;            // deterministic B
export function alphaBootstrapTier(rowCount: number, b: number): number;   // min(B, 250) above 50k rows
export function bootstrapTierCopy(rowCount: number): string;        // the disclosed AC-53 sentence
export function bootstrapBundle(panel: PanelCodes, options: {
  seed: number; B: number; alphaB?: number; alpha?: number;
  alphaLevel?: AlphaLevel; alphaOrder?: readonly string[]; deadlineAt?: number;
}): { accuracy: ConfidenceInterval | null; kappa: ConfidenceInterval | null;
       alpha: ConfidenceInterval | null; deadlineHit: boolean };
// ONE shared resample loop per replicate: a single mulberry32 stream (inlined) and one fused
// draw+accumulate pass update accuracy + κ + α together — never three independent draws —
// each statistic derived from the replicate's class-pair counts, so a replicate never
// rebuilds labels. The deadline is an ABSOLUTE timestamp; a trip returns nulls only.

// _lib/calibration.ts
export function calibrationPanel(rows: readonly RawVerdict[], options: {
  positiveClass: string | null; judgeScoreMode: JudgeScoreMode; bins: number; binMode: BinMode;
  judgeScoreAmbiguous?: boolean;
}): CalibrationPanel;
// ECE/Brier are POINT ESTIMATES with no CI, labelled as such. Both modes are computed so
// the mismatch detector can compare them; a |Δ| > 0.05 in p-positive mode raises
// "your scores look like confidences, not probabilities" (AC-41).

// _lib/grade.ts
export const GRADE_BANDS: readonly { min: number; grade: string; label: string }[];
export const GRADEBASIS: KappaWeights;               // === "unweighted", always
export function letterGrade(kappa: number | null): string;
export function landisKochLabel(kappa: number | null): string;
export function gradeCopy(kappa: number | null): string;

// _lib/biasMetrics.ts
export function biasMetrics(rows: readonly RawVerdict[]): BiasPanel;

// _lib/disagreements.ts
export function buildDisagreementRows(rows: readonly RawVerdict[]): DisagreementRow[];

// _lib/report.ts — ★ the single source of semantics
export function computeReport(rows: readonly RawVerdict[], options: ComputeOptions): CalibrationReport;
export function reportDisagreementWindow(r: CalibrationReport, offset?: number, limit?: number): CalibrationReport;

// _lib/analyze.ts — the ONE pipeline seam; the worker and the sync fallback both call it
export function analyzeVerdicts(verdictsText: string, options?: AnalyzeOptions): AnalysisOutcome;
export function countBytes(text: string): number;     // UTF-8 honest units
export function countWords(text: string): number;
export function countLines(text: string): number;

// _lib/reportRender.ts — pure string builders over a settled report; 17 sig figs per decimal
export function renderMarkdownReport(r: CalibrationReport): string;
export function renderOneLineVerdict(r: CalibrationReport): string;
export function renderAgreementJsonl(r: CalibrationReport): string;
export function renderReceipt(r: CalibrationReport, inputs: ReturnType<typeof kappaReceiptInputs>, options: {
  seed: number; confidenceLevel: number; deadlineMs: number; deadlineHit: boolean;
}): string;
export function degradedNoticeCopy(ciDropped: boolean | null): string;

// _services/llmDiagnosis.ts — every side effect injected; no fetch global at module scope.
export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_DIAGNOSIS_MODEL = "openai/gpt-4o-mini";
export function isDiagnosisConfigured(apiKey: string | null | undefined): boolean;
export function selectDiagnosisDisagreements(r: CalibrationReport): DisagreementRow[];
export function buildDiagnosisRequest(rubric: string, rows: readonly DisagreementRow[]): DiagnosisHttpRequest;
export async function llmDiagnosis(request: DiagnosisHttpRequest, options: {
  apiKey: string; model?: string; fetchImpl?: typeof fetch; signal?: AbortSignal;
}): Promise<DiagnosisResult>;
// Deterministic selection: confusion cells ranked by frequency desc, rows picked ROUND-ROBIN
// across distinct cells (one per cell at a time, highest-frequency cell first), ties by
// example_id asc — and the UI copy says so. A11 caps the request in BOTH dimensions: ≤25
// rows, each field excerpted to 2,000 chars (so the worst case is ~200 KB, not hundreds of
// MB), and the response arrays capped at 32 items × 2,000 chars.
// An AbortError surfaces as DiagnosisError("aborted") and the panel returns to configure-key.
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
  `1` (nominal), `(v−v')²` (interval), `(Σ_{g=v}^{v'} n_g − (n_v+n_v')/2)²` (ordinal).
  Level guards: `interval` requires all-numeric labels (`null` + reason otherwise); `ordinal`
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
- **ECE / Brier**: point estimates only, no CI, labelled as such. ECE bins equal-width by
  default (10 bins); Brier is the mean squared error between the score and the 0/1 outcome.

---

## 5. Worker + hook contract — `_workers/compute.worker.ts` + `_hooks/useToolWorker.ts`

```
monotonic id + stale guard   →  if (event.data.id < requestIdRef.current) return;
adaptive debounce (chars)    →  ≤5,000 → 0ms · >5,000 → 40ms · >20,000 → 120ms · >200,000 → 250ms
watchdog (hard wall)         →  TIERED by payload size (watchdogMsFor):
                                 ≤20,000 chars → 1,500 ms · ≤200,000 → 3,000 ms
                                 ≤2,000,000 → 5,000 ms · above → 8,000 ms
crash degrade                →  onerror / onmessageerror / spawn failure ⇒ degradeToMainThread()
cooperative deadline (worker)→  1,000 ms, ABSOLUTE timestamp taken before the parse (A2),
                                 checked at phase boundaries and every 128 replicates
sync fallback deadline       →  800 ms (stricter, protects UI frames), and on that path the
                                 parse carries the same budget via parseDeadlineArmed (A10)
announce debounce            →  800 ms trailing for successes; errors settle immediately
single degradation path      →  degradeToMainThread(): amber banner + same pure core
report LRU (worker)          →  32 entries, keyed by an FNV-1a content hash with recency
                                 refresh, only error-free results cached — AND a content
                                 FINGERPRINT (length + position-weighted checksum + head/tail
                                 64 chars + rubric length + settings) that a hit must match
                                 before it may be served (A13: a 32-bit collision recomputes
                                 instead of returning the wrong report). Each entry stores
                                 the SUMMARY + the display window, never the full row set.
```

**Five operating rules (the contract, in full):**

1. **Two-phase compute inside one dispatch.** Phase A (parse → confusion → κ → α → baseline →
   grade → disagreements → bias → calibration) is always cheap and always runs: measured at
   0.9 ms (1k rows) to 201 ms (200k rows). Phase B (bootstrap CIs via `bootstrapBundle`) is
   the expensive half and is deadline-bounded. The worker returns **one** payload so the store
   settles atomically — and that payload is the **windowed** payload: the full report with
   `disagreements` replaced by the first `MAX_TABLE_ROWS` (2,000) rows, `report.n`, the
   receipt and every point statistic untouched. The full row set is never structured-cloned
   per dispatch.
2. **`B` is a pure function of the row count — never of wall-clock.** Same rows ⇒ same `B` ⇒
   byte-identical CIs on every machine. The deadline may *abort* CIs (documented degradation,
   honest copy, `ci.* = null`, `ciDropped: true`, the receipt names the deadline); it never
   silently changes `B`, a point statistic or the baseline (AGENTS §31).
3. **Worker deadline checks are amortized**, at phase boundaries and every 128 bootstrap
   replicates. That is a *sampling*, not a wall — which is why, near the budget boundary,
   whether the CIs survive is a distribution rather than a constant (documented with measured
   runs in [`BENCHMARKS.md`](./BENCHMARKS.md)). The watchdog tier is sized so an in-cap
   200k-row dispatch is never aborted: 8,000 ms against a measured 1,011–1,361 ms.
4. **Watchdog ≠ deadline.** The watchdog protects against an unkillable hang (a bug, or an
   extension-hostile environment); the cooperative deadline reports first in normal operation,
   because Phase B is cooperative. `onerror` / `onmessageerror` catch a crashed or
   protocol-broken worker. The abort settles **atomically** (A5): the request id is bumped so
   any zombie reply is stale by definition, a fresh worker is respawned, and `applyComputation`
   clears `stats` and the window **in the same `set()`** that records the error — so a stale
   stat card never renders beside an error.
5. **Honest fallback.** `onerror` / `onmessageerror` / watchdog / spawn failure all funnel
   through `degradeToMainThread()`, which runs the *same* `analyzeVerdicts()` with
   `SYNC_DEADLINE_MS` and marks the report `degraded: true` (engine `"main-thread"`), so the
   banner can say *"computing on the main thread … the stricter sync budget capped the
   bootstrap CIs"* rather than pretending the intervals are identical.

### Caps & budgets (all in `_lib/constants.ts` — one import site, asserted)

| Constant | Value | Why |
|---|---:|---|
| `MAX_ROWS` | 200,000 | rows analyzed per run; the cap is applied **before** analysis and the true total is still counted |
| `MAX_COLS` | 64 | header sanity; more ⇒ parse error |
| `MAX_INPUT_CHARS` | 40,000,000 | 40 MB paste ceiling; beyond → clear error, nothing parsed |
| `MAX_INPUT_CHARS` × `MAX_ROWS` | the A16 interaction | the two caps multiply, so the real row ceiling for a critique-bearing session is ≈190k (see `BENCHMARKS.md`) |
| `MAX_PERSISTED_TEXT_CHARS` | 1,000,000 | A1: the persisted slice is bounded — above it nothing is written, so a reload is honest instead of a quota crash |
| `MAX_RUBRIC_CHARS` | 8,000 | rubric pane cap |
| `MAX_TABLE_ROWS` | 2,000 | disagreement display window; the export carries the true totals beside it |
| `MAX_PARSE_ISSUES` | 5 | issues DISPLAYED per run; `issueCount` stays the honest total |
| `BOOTSTRAP_B` | 2,000 | default tier |
| `BOOTSTRAP_TIERS` | ≤50,000→2,000 · ≤100,000→1,000 · ≤150,000→500 · ≤200,000→500 | deterministic; monotonic non-increasing (asserted, AC-53) |
| `BOOTSTRAP_MIN_B` | 200 | lower bound so a CI is still reported at tiny n |
| `BOOTSTRAP_ALPHA_B` | `min(B, 250)` above 50,000 rows | α-specific tier, disclosed via `alphaReplicates` |
| `WORKER_DEADLINE_MS` | 1,000 | cooperative budget inside the worker |
| `SYNC_DEADLINE_MS` | 800 | stricter budget on the main thread |
| `WATCHDOG_MS` | 1,500 | the small-paste wall |
| `WATCHDOG_TIERS` | `watchdogMsFor`: 1,500 / 3,000 / 5,000 / 8,000 ms | A2: tiered by payload size so a 200k dispatch settles |
| `PARSE_DEADLINE_CHECK_ROWS` | 512 | A10: the parse budget's amortized clock cadence |
| `SUCCESS_ANNOUNCE_DEBOUNCE_MS` | 800 | collapse typing bursts into one SR update |
| `ARTIFACT_CACHE_CAPACITY` | 32 | LRU entries in the worker (summary + window only) |
| `ECHO_LIMIT_CHARS` | 4,000 | how much of the paste the pane mirrors back |
| `DIAGNOSIS_DISAGREEMENT_LIMIT` | 25 | rows sent to the single opt-in LLM call |
| `DIAGNOSIS_EXCERPT_CHARS` | 2,000 | A11: per-field excerpt cap on the transmitted request |
| `DIAGNOSIS_MAX_ARRAY_ITEMS` / `DIAGNOSIS_MAX_STRING_CHARS` | 32 / 2,000 | A11: response caps in both dimensions |
| Initial page JS | ≤ 200 kB | `context.md` §4.1 — shipped at 199 kB |

---

## 6. State — zustand split (`_store/useToolStore.ts`)

| Field | Kind | Notes |
|---|---|---|
| `verdictsText` | **persisted** | the pasted JSONL/CSV |
| `rubric` | **persisted** | optional rubric text |
| `settings` | **persisted** | `{ seed, confidenceLevel, judgeScoreMode, positiveClass?, labelOrder? }` |
| `stats` | transient | the settled analysis (`VerdictAnalysis`) |
| `disagreementWindow` | transient | `{offset, rows, totalCount}` for the table |
| `parseIssues`, `parseIssueCount` | transient | from the last parse |
| `isProcessing` | transient | pipeline busy |
| `errorMessage` | transient | friendly, `null` when clean; a rejection clears `stats` too |
| `isWorkerAvailable` | transient | `null` unknown → `true` worker → `false` degraded |
| `degraded` | transient | drives the amber banner |
| `isCommandPaletteOpen`, `isSamplesOpen` | transient | UI chrome |
| `statusAnnouncement` | transient | `{ message, seq }`; `seq` re-keys identical text |

- Persist key **`judgewright-tool-storage`**, `version: 1`, `skipHydration: true`, explicit
  rehydrate on mount inside the hook, `partialize` limited to exactly
  `{ verdictsText, rubric, settings }`.
- `merge()` is defensive: `settings: { ...DEFAULT_SETTINGS, ...(incoming.settings ?? {}) }`.
- **Atomic settle:** `applyComputation(result, { announce, window })` sets report + window +
  issues + error + announcement in **one** `set()`; consumers never see an intermediate frame.
  A failure path clears the previous paste's numbers in the same `set()` that records the error.
- One store per concern: tool store + auth-prompt store (`_store/useAuthPromptStore.ts`).
- **The diagnosis key is not store state at all** — it lives in `DiagnosisPanel`'s React state,
  which is why it cannot be persisted by construction.

---

## 7. Data flow

```
paste / drop verdicts ─┐
                        ├─► parseVerdicts(text) ─► RawVerdict[] + ParseIssue[]
rubric + settings ─────┘            │
                                     ▼
               useToolWorker (debounce tier → postMessage, id = ++requestIdRef)
                                     ▼
               _workers/compute.worker.ts
                  (LRU lookup: key + fingerprint match, else recompute)
                  analyzeVerdicts(text, { deadlineMs: 1_000, engine: "worker", …settings })
                    → parseVerdicts  → computeReport
                        A: parse-validate → confusion → κ → α → baseline → grade →
                           calibration → bias → disagreements
                        B: bootstrapBundle — one RNG stream, one index array per replicate
                                     ▼
               WorkerOutputPayload (id, ok, error, degraded, stats, issues, issueCount,
                                    disagreementWindow{offset, rows ≤ MAX_TABLE_ROWS, totalCount})
                                     ▼
               applyComputation()  ── atomic set ──► report card UI
                                     │
                                     ├─► reportDisagreementWindow() slices the display window
                                     ├─► export: markdown card · one-line verdict · agreement JSONL · receipt
                                     └─► (opt-in, BYOK) llmDiagnosis() ─► diagnosis panel
```

**No payload leaves the browser** on the default path. The only outbound requests the product
can ever make are the single opt-in OpenRouter call and (when env-configured) Supabase OAuth.
Every `connect-src` origin is listed in the `DECLARED_ORIGINS` constant; a static test asserts
the shipped CSP never drifts past that list (both `connect-src` and `img-src`), and the
Playwright guard asserts the runtime-observed origins are a subset too (`AC-20`).

---

## 8. Failure modes — graceful behavior, each with user-facing copy

Errors are values, never exceptions (BAR §4.4). The copy column quotes the shipped string
where one is a module constant, and describes the composed shape where it is built at runtime.

| # | Failure | Detection | Graceful behavior | Copy (shipped) |
|---|---|---|---|---|
| FM-1 | Malformed row | row fails validation | Row dropped; first `MAX_PARSE_ISSUES` issues listed with line, class + reason; report still computes from the valid rows; amber strip names the skip | `line 42: missing "example_id"` + `3 of 3 rows skipped — report computed from the valid rows` |
| FM-2 | Mixed label vocabularies | ≥ 2 known families in one label column | Hard error, no report, offending set listed | `Labels {PASS, FAIL, TRUE} mix two vocabularies — normalize before comparing. Known aliases: pass/fail, yes/no, true/false, 1/0.` (composed in `labels.ts`, the echoed labels verbatim) |
| FM-3 | No numeric scores for ECE/Brier | `judgeScore` absent or unusable on every row | `calibration.computable = false`; the panel renders the reason; no fabricated 0 | `not computable — no numeric scores` (`CALIBRATION_NOT_COMPUTABLE_REASON`) |
| FM-4 | κ undefined (degenerate rater) | the single `cohensKappa` guard | `kappa = null`, `grade = "—"`, headline shows the reason; Δ and the κ CI are `null` | `κ is undefined: no label variance to correct for. Report accuracy instead.` (`KAPPA_UNDEFINED_COPY`) |
| FM-5 | > 200,000 rows | `rowCount > MAX_ROWS` | Capped **before** analysis; first `MAX_ROWS` analyzed; amber strip shows the true total; `truncated: true` rides in the report | `Results capped at 200,000 of 1,000,000 rows.` (composed in `parse.ts`) |
| FM-6 | Worker crash (`onerror` / `onmessageerror`) / structured-clone failure / watchdog / spawn failure | hook handlers | `degradeToMainThread()`: terminate, respawn once, flip `isWorkerAvailable`, amber banner, same core on the main thread, report flagged `degraded`, engine `"main-thread"`; the abort clears stats in the same `set()` as the error (A5) | `Worker unavailable — computing on the main thread. Same core, same point statistics; the stricter sync budget capped the bootstrap CIs, so the intervals are omitted for this run.` — or, when nothing was dropped, `…Every number is identical; only the engine badge differs.` (`degradedNoticeCopy`) |
| FM-7 | Bootstrap deadline trips | cooperative deadline (absolute, A2) | Phase A already settled; `ci.* = null` with `ciDropped: true`; point statistics, `B` and the baseline unchanged; the receipt names the deadline | `Bootstrap CIs omitted — the deadline was reached. Point statistics are unaffected.` |
| FM-8 | LLM key present, non-2xx | `fetch` resolves non-2xx | `DiagnosisError("network")`, no retry, no persistence, panel stays interactive, key kept in memory only | `Diagnosis failed (HTTP 429). Nothing was stored; retry when ready.` |
| FM-9 | LLM disabled (no key) | `isDiagnosisConfigured` is false | Panel is a configure-key no-op; **zero** network calls; every deterministic feature fully functional | `Configure a key to run the diagnosis — nothing is sent anywhere until you do.` (`DIAGNOSIS_CONFIGURE_COPY`) |
| FM-10 | Nonconforming LLM JSON | response fails validation | `DiagnosisError("format")` naming the offending field; the raw text is never stored | `The diagnosis JSON was missing the curated fields (rubric_holes, bias_flags, misapplications, priority_fix).` |
| FM-11 | Empty or whitespace input | text trims to empty | Rejection value; the pane says what to paste. (The *first run* is seeded with a small demo session at store init — `SAMPLE_VERDICTS` — so the instrument never boots blank; that is initialization, not a surprise swap mid-session) | `Nothing to analyze yet — paste verdicts as JSONL or CSV.` |
| FM-12 | < 2 pairable values for α | pairable `n < 2` | `alphaPanel = null`, `alphaUndefinedReason` set, the α panel explains | `α needs at least two coders on at least two examples.` |
| FM-13 | Bias columns absent | `position` / `preferredLonger` missing | The bias panel lists what is missing instead of guessing | `Not computable from your input — needs a `position` (0/1) column and/or a `preferred_longer` column.` |
| FM-14 | Only one critic's labels | `humanLabels.length === 1` everywhere | α still computed over `[judge, human]` with the mandate disclosure; the human ceiling is reported unavailable | `Human ceiling needs ≥2 human raters per example.` |
| FM-15 | Ambiguous score column | two distinct columns map to `judge_score` | `judgeScoreAmbiguous` rides to the report; the calibration panel is **not computable**; the rest of the report computes normally | `not computable — two columns map to judge_score; rename one so the score has a single meaning` (`CALIBRATION_AMBIGUOUS_REASON`) |
| FM-16 | Duplicate `example_id` | dup detection at parse | Both rows kept and counted as independent examples; the warning lists the ids (first 5) | `duplicate example_id "X42" — rows are counted independently` |
| FM-17 | Every row invalid (non-empty input) | zero valid rows after parse | **`report === null`** — no zero-filled report; the error envelope settles atomically | `No usable rows — every row failed validation. Fix the first issue and try again.` |
| FM-18 | LLM request aborted mid-flight | `AbortError` | `DiagnosisError("aborted")`; the panel returns to configure-key; the key stays in memory only | `Diagnosis aborted — nothing was sent or stored.` |
| FM-19 | Storage quota exceeded | the store's `setItem` throws | A1: the over-quota paste is simply **not written** (the rubric and settings still are), so a reload is honest rather than a crash; a forced-throw write is swallowed and the session keeps computing | the persisted payload stays small; no user-facing error, because nothing the user asked for failed |

---

## 9. Privacy & security posture

- **CSP** (built in `next.config.ts`, `connect-src` from `DECLARED_ORIGINS`):
  `default-src 'self'; script-src 'self' 'unsafe-inline'` (+ `'unsafe-eval'` **dev only**);
  `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:`; `font-src 'self' data:`;
  **`connect-src 'self' https://*.supabase.co wss://*.supabase.co https://openrouter.ai`**;
  `worker-src 'self' blob:`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`;
  `object-src 'none'`. HSTS (`max-age=63072000; includeSubDomains; preload`), `nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`,
  `X-DNS-Prefetch-Control: on`, `poweredByHeader: false`. `img-src` carries **no** third-party
  host: the OAuth-avatar origins were removed so an unused allow-list entry cannot become an
  egress path with no owner, and `csp.test.ts` asserts it never drifts back.
- **`DECLARED_ORIGINS`** is the single documented list of every origin that may appear in
  `connect-src` (`'self'` / same-origin, `https://*.supabase.co`, `wss://*.supabase.co`,
  `https://openrouter.ai`). A **static** test parses the shipped CSP and fails if any origin
  is outside the list; the Playwright guard asserts the runtime-observed origins are a subset
  of it (`AC-20`).
- **Zero-egress is a test** (`AC-20`): the Playwright allow-list is derived from the same
  constant that builds `connect-src`, so a new origin without a CSP change fails CI.
- **E2E env is pinned empty**: `playwright.config.ts` sets
  `NEXT_PUBLIC_SUPABASE_URL=""` and `NEXT_PUBLIC_SUPABASE_ANON_KEY=""` so the Supabase
  client is a `null` no-op and no Supabase origin is ever observed; `.env.example` notes this.
- **BYOK key handling**: React component state only; never persisted, never logged, never in
  a URL, gone on reload; the request body is never written to the store, and the panel
  discloses exactly what it sends before sending it.
- **Auth is env-gated no-op** (BAR §5.3): singleton-promise client, lazy SDK import,
  `null` when keys absent; `shouldPromptSignIn` is pure and unit-tested; core features and
  export are never gated — the sign-in offer fires after the export file already exists.

---

## 10. File tree (what the build produces)

```
app/tools/judgewright/
  page.tsx                       orchestration + trust pills + layout (client)
  _components/                   TopToolbar.tsx, CalibrationControls.tsx, RawEditorPane.tsx,
                                 ReportPane.tsx, ReportInsights.tsx, ExportBar.tsx,
                                 DiagnosisPanel.tsx, SiteHeader.tsx, StudioFooter.tsx,
                                 CommandPalette.tsx, CompetitorMatrix.tsx,
                                 KnowledgeHub.tsx, FaqSection.tsx, StatusLiveRegion.tsx,
                                 ThemeToggle.tsx, auth/, providers/
  _hooks/                        useToolWorker.ts, useKeyboardShortcuts.ts, useAuth.ts
  _lib/                          types.ts, constants.ts, analyze.ts, parse.ts, csv.ts,
                                 labels.ts, confusionMatrix.ts, cohensKappa.ts,
                                 krippendorffAlpha.ts, chanceBaseline.ts, bootstrapCI.ts,
                                 calibration.ts, grade.ts, biasMetrics.ts,
                                 disagreements.ts, report.ts, reportRender.ts,
                                 presets.ts, guide.ts, authGate.ts, supabaseClient.ts,
                                 __tests__/  (21 suites + repro.entry.ts +
                                              repro.analyze.entry.ts)
  _services/                     llmDiagnosis.ts (BAR §8 exception — the only IO module)
  _store/                        useToolStore.ts, useAuthPromptStore.ts
  _workers/                      compute.worker.ts (+ __tests__/)
components/ui/                   Tier-0 UI primitives (docs/ui-kit.md)
lib/utils.ts                     copyTextToClipboard (async Clipboard → execCommand fallback)
lib/site.ts                      FAQ + site content (the FAQPage JSON-LD source)
app/sitemap.ts · app/robots.ts   generated from metadataBase
app/layout.tsx                   next/font/google (Inter + JetBrains Mono) — build-time fetch
scripts/serve-standalone.sh      boots the real standalone artifact for Playwright
scripts/bench.ts                 `npm run bench` — the reproducible pure-core benchmark
e2e/                             smoke, demos, disagreements, perf, visual, copy
```

> **Removed from the planning revision (never shipped):** `_lib/rng.ts`, `_lib/limits.ts`,
> `_lib/faq.ts`, `_workers/stats.worker.ts`, `_hooks/useJudgewrightWorker.ts`, the
> `_components` catalog of `StationHeader/MainWorkspacePane/ReportCardPane/HeadlineCard/
> ConfusionHeatTable/DisagreementTable/BiasPanel/AlphaPanel/CalibrationPanel/Toaster`,
> `scripts/oracle.mjs`, `scripts/oracle.py`, `fixtures/oracle-*.json`, `npm run oracle` and
> the oracle CI job. The shipped names are in the tree above.

---

## 11. Decision log

1. **Grade from unweighted κ, always** — one letter so the headline is unambiguous. The bands
   are the **Landis–Koch convention applied to unweighted κ**, the label prints next to the
   letter, and the UI carries the line *"a convenience mapping, not a standard."* Weighted
   linear/quadratic κ exist only as a labelled secondary row; they never feed the grade, the
   deflation or the CI (`AC-39`).
2. **α over the panel `[judge, human₁, …]`** — the panel α is computable on every dataset and
   the human-ceiling α (`alphaHumans`, human raters only) is the natural second figure; the
   judge is **not** dropped from the panel. What makes this honest is the mandatory
   disclosure copy (with one human rater the panel is two coders, so this is α — a
   chance-corrected coefficient — not Cohen's κ) and the κ-bands label of `AC-50`.
3. **CIs on accuracy / unweighted κ / α only** — ECE, Brier and per-class metrics are point
   estimates, labelled as such. Statistically honest and inside the worker budget.
4. **Weighted κ defaults to unweighted** — the headline number must be the chance-corrected
   figure a reviewer can recompute from the 2×2 alone; the weighted rows are labelled
   secondary.
5. **Tiered, deterministic `B`** rather than a wall-clock-adaptive `B` — reproducibility beats
   squeezing a few more replicates out of a fast machine. The α-specific tier
   (`min(B, 250)` above 50,000 rows) ships and is disclosed via `alphaReplicates` /
   `alphaBootstrapReplicates`.
6. **LLM diagnosis is one call, and its send button is the only thing that constructs the
   payload** — the report never auto-bundles user data for a model.
7. **`judge_score` has two explicit modes and no auto-detect** — `p-positive` (default) vs
   `confidence`, user-selected; ambiguity (two columns claiming the score slot) ⇒ the
   calibration panel is *not computable* with its own copy; the mismatch detector surfaces
   *"your scores look like confidences, not probabilities"* when the modes diverge
   (`AC-40`, `AC-41`).
8. **`positiveClass` is explicit** — default = second sorted label, user-selectable in one
   click, echoed in the confusion-matrix header and the receipt (`AC-51`).
9. **No transcendentals in `_lib/`** — no `Math.log/pow/exp/sqrt/sin/cos/atan`; eslint rule
   + purity test (`AC-60`).
10. **Label vocabulary** — unknown-but-consistent values are a legal label set; the hard
    error fires only when two values normalize into two different known families.
11. **Float tolerance** — 1e-12 against external references; bit-exactness for Judgewright's
    own outputs (17 significant digits, byte-comparable across processes).
12. **Deadline abort is permanent policy** — the deadline may abort CIs; it never changes a
    number. The abort is visible: `ciDropped`, the receipt reason, the deadline value
    (`AC-52`).
13. **`llmDiagnosis` lives in `_services/`, not `_lib/`** — a deliberate BAR §8 exception,
    documented in `AGENTS.md` so an auditor sees it is intentional.
14. **The watchdog is tiered by payload size** (A2) — a flat 1.5 s wall aborted legitimate
    200k-row dispatches, which the "an in-cap input always settles a report" contract
    forbids. The tier table is bounded and monotonic non-decreasing, so a genuine
    unkillable hang still trips it.
15. **Persistence is bounded and quota failures fail soft** (A1) — an unbounded write threw
    `QuotaExceededError` out of the store's `set()` and unmounted the tree. The persisted
    slice is capped instead: the session keeps computing and the reload story is honest.
16. **The aborts settle atomically** (A5) — the error and the cleared numbers land in one
    `set()`, so a stale stat card never renders beside a rejection.
