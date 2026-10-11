# Judgewright — PLAN (v1, planning artifact)

> **Status:** PLANNING DOCUMENT. Companion to [`SPEC.md`](./SPEC.md) and
> [`ARCHITECTURE.md`](./ARCHITECTURE.md). Thin slice first, tests alongside, disjoint
> Phase-3 file ownership so build agents never collide. Revised by the PLAN REVISER: all
> CRITICAL/MAJOR/MINOR review findings are encoded as tasks, tests and measurements.
>
> **Gate order (every milestone):** `npm run typecheck` → `npm run lint` → `npm test` →
> `npm run build` → `npm run test:e2e`. A milestone is NOT done until all five are green.

---

## 1. Feasibility experiments (run in `/tmp/jwfeas`, NOT in the repo)

A throwaway plain-JS prototype of the statistics core was implemented and checked against
published / independently verified reference values. Everything below is an observed result
unless marked *estimate*.

**Reference machine (all wall-clock numbers below):** the planning machine running
**node v24.13.0** on Linux; its CPU/RAM are recorded in `BENCHMARKS.md` before any
performance claim ships. Wall-clock acceptance criteria marked **(perf-gated)** in `SPEC.md`
run only under `PW_PERF=1` in a non-blocking CI job on this machine.

### 1.1 Cohen's κ — reference matches

| Fixture | Expected (source) | Observed | Δ |
|---|---|---|---|
| Canonical 2×2: `a=20, b=5, c=10, d=15` (p_o = 0.70, p_e = 0.50) | `0.4` (Cohen 1960 / Wikipedia worked example) | `0.3999999999999999` | ≤ 1e-16 |
| Hand-computed 2×2: `a=12, b=3, c=2, d=3`, n = 20 (p_o = 0.75, p_e = 0.60) | `0.375` (computed by hand) | `0.375` | 0 |
| Perfect agreement | `1` | `1` | 0 |
| Constructed chance agreement (100 items, both raters 50/50) | `0` | `0` | 0 |
| Multiclass `human=[2,0,2,2,0,1]`, `judge=[0,0,2,2,0,2]` | `0.4285714285714286` (scikit-learn documented example; re-derived by hand: (A·n−S)/(n²−S) = (4·6−15)/(36−15) = 9/21) | `0.4285714285714285` | 1 ULP |
| Same data, **weighted-linear** | `0.5` (scikit-learn oracle) | `0.500000000000000` | 0 |
| Same data, **weighted-quadratic** | `0.545454545454545` (scikit-learn oracle) | `0.545454545454546` | 1 ULP |
| 3-class fixture `[[3,1,0],[1,2,0],[0,0,3]]`, rowTot = colTot = [4,3,3], n = 10 | unweighted `0.696969696969697` · linear `0.7777777777777778` · quadratic `0.855072463768116` (scikit-learn oracle) | identical strings | 0 |
| Adjacent-error fixture (`AC-39`): 16 rows, ordered classes `1<2<3`, errors only off-by-one (4× `(1,1)`, 1× `(2,1)`, 1× `(3,2)`, 10× `(3,3)`) | accuracy `0.875` · unweighted κ `0.744` (contracts to a **B**) · linear κ `0.8545454545454545` (an **A**) · quadratic κ `0.9219512195121952` · deflation exactly `0.131` | identical | 0 |

**Formula form matters.** The disagreement-weight form `κ = 1 − D_o/D_e` (with `w_ii = 0`)
is what matches every oracle; an agreement-weight form silently returns values > 1. For the
unweighted case the **integer-rational fast path** `κ = (A·n − S)/(n² − S)` (exact integer
sums, one division) is adopted: it removes float summation drift and lands on the nearest
double. Cross-checked against `sklearn.metrics.cohen_kappa_score` (scipy/sklearn installed in
a throwaway venv, never in the repo).

**The degenerate guard (C3, decided).** The fast path divides by `n² − S`, which is `0`
exactly when each rater used a single label (`S === n²`) — the perfect-single-label case
(`human=[PASS,PASS], judge=[PASS,PASS]`) would evaluate `0/0 = NaN` and ship a NaN headline.
`cohensKappa` therefore carries **one guard before either path**: a rater with fewer than two
distinct labels ⇒ `null` + `kappaUndefinedReason`. That also covers the one-rater-constant
case, where `p_o ≡ p_e` structurally and the value would carry no information about the judge.

### 1.2 Krippendorff's α — reference matches

| Fixture | Expected (published) | Observed | Δ |
|---|---|---|---|
| Published worked example — 3 coders × 15 units, n = 26 pairable values, **nominal** | `0.691` (Wikipedia "A computational example"; exact value `1 − 75/243`) | `0.691358024691358` | 0 |
| Same data, **interval** | `0.811` (same source; exact `1 − 12/63.44`) | `0.8108448928121059` | 0 |
| Perfectly agreeing panel | `1` | `1` | 0 |
| Binary values: nominal vs ordinal | identical (bit-for-bit) | identical | 0 |
| Ordinal/interval fixture (`AC-44`/`AC-45`): 6 units × 2 coders, ordered classes `1<2<3` — 3× `[1,1]` then 3× `[2,3]` | nominal `0.2666666666666666` · ordinal `0.7962962962962963` · interval `0.6666666666666666`; identical under the order-preserving relabels `{10,20,30}` and `{LOW,MID,HIGH}`+`labelOrder` | identical | 0 |
| Panel α on the headline fixture (`AC-50`): 1,000 units, panel `[judge, human]` | nominal α `0.5192400192400193` vs unweighted κ `0.5192307692307692` — the ≈ 9.3e-6 gap is intentional (different marginal conventions) | identical | 0 |

The data matrix was reconstructed from the published source (coders A/B/C × units 1–15,
`*` = missing; units 1, 2, 14 unpairable) and the published numerator/denominator
(`D_o = 1 + 2`, `D_e = 243/25` nominal; `D_o = 1·2² + 2·1²`, `D_e = 793/25` interval) was
re-derived by hand before matching.

### 1.3 Δκ-deflation headline + the always-pass baseline

| Base rate | always-majority agreement | κ of the always-majority judge |
|---|---|---|
| 50% | 0.5000 | 0.000000000000000 |
| 70% | 0.7000 | 0.000000000000000 |
| 90% | 0.9000 | 0.000000000000000 |
| 95% | 0.9500 | 0.000000000000000 |
| 99% | 0.9900 | 0.000000000000000 |

**The always-majority dummy judge has κ ≡ 0 exactly** — a clean identity to print, so a judge
with κ ≈ 0 is read as "indistinguishable from always-pass". Headline fixture
(920/30/20/30, n = 1000; human marginals 940/60, judge marginals 950/50): agreement `0.95`,
κ `0.5192307692307692`, Δκ `0.4307692307692308`, baseline `0.94`, lift over baseline `0.01` —
all matched exactly.

**How the identity is computed (decided, C3/M13):** `baselineKappa` is derived **analytically**
inside `chanceBaseline.ts` from `p_o = p_e` (the dummy's expected agreement equals its observed
agreement), asserted at `AC-09` across base rates 0.05–0.99. It is **not** computed by routing
the constant dummy through `cohensKappa` — which now returns `null` for constant raters — so the
C3 guard and the chance-baseline feature coexist without contradiction.

### 1.4 Bootstrap reproducibility (mulberry32, fixed seed)

```
scores: 120 values, B = 2000, percentile
seed 42, run 1 = 0.43883333333333330, 0.54100000000000015, mean 0.49052987499999989
seed 42, run 2 = 0.43883333333333330, 0.54100000000000015, mean 0.49052987499999989   → byte-identical
seed 43        = 0.43724999999999997, 0.54308333333300014, mean 0.49050329166666662   → differs
```

Same seed → byte-identical interval (17 significant digits) across separate node processes;
a different seed moves the interval. Serialization to fixed precision is what makes
`AC-13` assertable. The production API resamples **row indices** (`AC-49`); the permuted-label
control (judge column rotated 500 positions on the headline fixture) yields κ̂ `−0.0576923076923077`
with a CI that contains 0.

### 1.5 ECE / Brier fixtures

ECE (equal-width, 10 bins) on the hand fixture `scores=[.9×4,.1×4,.6×2]`,
`correct=[1×4,0×4,0×2]` → **0.2** exactly; equal-frequency (5 bins) → **0.2**;
Brier → **0.07999999999999999** = `(0.01·4 + 0.01·4 + 0.36·2)/10` exactly.
Under the `confidence` score mode the **same rows** yield ECE **0.16** and Brier **0.04**
(the `.6` rows flip outcome) — the observable mode difference of `AC-40`.

### 1.6 Performance measurements (reference machine, node v24.13.0)

| Work | Cost |
|---|---|
| JSONL parse, 100,000 rows (10.4 MB) | **63 ms** |
| κ bootstrap, 20k rows, B = 2000 | 151 ms |
| κ bootstrap, 50k rows, B = 2000 | 364 ms |
| κ bootstrap, 100k rows, B = 1000 | 355 ms |
| κ bootstrap, 200k rows, B = 2000 | 1,465 ms (**over the 1.0 s worker deadline**) |
| κ bootstrap, 200k rows, B = 500 | 356 ms |
| accuracy resample, 200k rows, B = 500 (optimized inline RNG) | 305 ms |

The first prototype (per-replicate closure calls + `Array.prototype.reduce`) was ~5× slower;
the production core must keep RNG advancement **inline** in typed-array loops.

### 1.7 Suggested caps (adopted in ARCHITECTURE.md §5)

| Constant | Value | Rationale |
|---|---|---|
| `MAX_ROWS` | 200,000 | worst measured complete run ≈ 0.6 s of compute (parse 130 ms + tiered bootstrap 356 ms + point stats), well inside the 1.5 s watchdog |
| `MAX_COLS` | 64 | header sanity |
| `MAX_INPUT_CHARS` | 40,000,000 | 40 MB paste ceiling |
| `BOOTSTRAP_B` | 2,000 | determinism over extra replicates; matches judgemetry's default spirit |
| `BOOTSTRAP_TIERS` | ≤50k→2,000 · ≤100k→1,000 · ≤150k→500 · ≤200k→500 | every tier measured ≤ 0.36 s ⇒ ≥ 2.7× headroom vs the 1.0 s deadline |
| `BOOTSTRAP_ALPHA_B` | `min(B, 250)` above 50,000 rows | **conditional** — applied only if §1.8 requires it; always disclosed via `alphaReplicates` |
| `WORKER_DEADLINE_MS` / `SYNC_DEADLINE_MS` / `WATCHDOG_MS` | 1,000 / 800 / 1,500 | RegexCraft verbatim values, still correct for this workload |
| `MAX_TABLE_ROWS` | 2,000 | DOM sanity inside a virtualised window; export pulls all rows on demand |
| `DIAGNOSIS_DISAGREEMENT_LIMIT` | 25 | keeps the single LLM call small and prompt-cheap |

### 1.8 α bootstrap — the mandatory measurement (owner: the M2.8 builder, before M2 exit)

The review found that the α bootstrap was never measured at any row tier — a silent route to
tripped deadlines. This section is the protocol **and** the record.

**Protocol (fixed):**

1. **ONE shared resample loop per replicate.** A single `mulberry32` stream and a single
   `Int32Array` of row indices drawn with replacement over the examples; accuracy, κ and α
   are all updated from **that same selection** (`bootstrapBundle` in `_lib/bootstrapCI.ts`).
   Never three independent loops, never three RNG streams, never three index arrays.
2. Fixture: the seeded benchmark dataset at each tier below, **with a judge critique string
   on every row** (the heavy payload case), over the coder panel `[judge, human]`.
3. Measure wall time in node on the reference machine with the same in-lined RNG discipline
   as §1.6, inside the 1,000 ms worker deadline budget, and record the numbers **in the
   table below and in `BENCHMARKS.md`**. The exact command lives in `BENCHMARKS.md`.
4. **Decision rule:** if the measured α cost at any tier consumes more than half of the
   `WORKER_DEADLINE_MS` budget, set `BOOTSTRAP_ALPHA_B = min(B, 250)` for row counts above
   50,000 and disclose `alphaReplicates` in the report and the CI panel. The tier never
   changes silently; a smaller dataset still shows `B = 2,000` (`AC-53`).

| Tier (row count) | B (from `bootstrapTier`) | α budget share | **Measured ms (D2, recorded)** |
|---|---:|---:|---:|
| ≤ 50,000 | 2,000 | ≤ 250 ms | **+4 ms for α** (acc+κ 330 ms → +α 334 ms) |
| ≤ 100,000 | 1,000 | ≤ 300 ms | **−19 ms for α** (403 ms → 384 ms; noise) |
| ≤ 150,000 | 500 | ≤ 350 ms | **−4 ms for α** (267 ms → 263 ms; noise) |
| ≤ 200,000 | 500 | ≤ 400 ms | **+6 ms for α** (351 ms → 357 ms) |

**Measured, not estimated (D2):** α rides the shared loop and costs ≤ 6 ms at every tier
(≤ 0.5% of the 1,000 ms worker budget) — it re-derives `D_o`/`D_e` from the replicate's
class-pair counts, so it never rebuilds the coincidence matrix. The `min(B, 250)` rule above
50,000 rows is therefore a **disclosed tier rule**, not a deadline-driven necessity, and the
report names it (`alphaReplicates` in the CI panel, the receipt and the tier copy). The
fused draw+accumulate pass keeps accuracy+κ at 351 ms for 200,000 rows / B = 500, against the
§1.6 estimate of 356 ms. Full worker dispatch (parse + report + all three CIs): 528 ms at
50k, 893 ms at 100k, 894 ms at 150k, 1,280 ms at 200k — inside the 1,500 ms watchdog and
inside the 1,000 ms cooperative budget at ≤ 150k rows, so the FM-7 abort (CIs dropped, point
statistics and `B` unchanged) is the escape hatch on a ≥ 2.5× slower machine. `AC-61` asserts
exactly that: no number ever changes to fit the clock. Commands: `BENCHMARKS.md`.

---

## 2. Milestones & dependencies

```
M1 ──► M2 ──► M3 ──► M4 ──► M5
  │        │        │        └─ polish / theme / benchmarks / CI / release artifacts
  │        │        └─ ECE/Brier + bias panel + disagreement table
  │        └─ α + chance baseline + Δκ headline + bootstrap CIs + grade + payload split
  └─ THIN SLICE: parser + confusion matrix + unweighted κ + report-card headline (binary labels)
```

Each milestone ends green on all five gates. **M1 must be fully green before any M2 file is
touched** — that is the thin-slice rule that keeps the core honest.

---

## 3. Task breakdown (owner files are DISJOINT within a milestone)

### M1 — Thin slice: parser + confusion matrix + unweighted κ + report-card headline
**Goal:** paste verdicts → get a report card with agreement, **unweighted** κ and a confusion
matrix for binary labels. Fully testable, zero LLM, zero α, zero CIs.

| Task | Files owned | Test |
|---|---|---|
| M1.1 Scaffold | `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `playwright.config.ts`, `vitest.config.mts`, `eslint.config.mjs`, `.env.example`, `LICENSE`, `CHANGELOG.md`, **`app/sitemap.ts`**, **`app/robots.ts`** | `npm run build` + smoke redirect spec; eslint carries the no-transcendentals `no-restricted-properties` rule for `_lib/**` (m8/AC-60); `playwright.config.ts` pins `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` **empty** (M10/AC-20); `.env.example` is the authoritative env source incl. `NEXT_PUBLIC_SITE_URL=https://judge.norai.tech` (M8/AC-58) |
| M1.2 Types + RNG | `_lib/types.ts`, `_lib/rng.ts` | `rng.test.ts` (determinism, distribution invariants, 0 ≤ x < 1) |
| M1.3 Parser | `_lib/parse.ts`, `_lib/csv.ts`, `_lib/labels.ts` | `parse.test.ts` (AC-14: the 10-row decision table + all six error classes), `parse.perf.test.ts` (AC-15) |
| M1.4 Confusion + κ | `_lib/confusionMatrix.ts`, `_lib/cohensKappa.ts` | `cohensKappa.test.ts` (AC-01…AC-05, **AC-42** degenerate guard), `confusionMatrix.test.ts` (**AC-51** positive class) |
| M1.5 Report core (point stats only) | `_lib/report.ts`, `_lib/presets.ts` | `report.test.ts` (AC-10 point stats, AC-28, **AC-35** all-rows-invalid ⇒ `report === null`), `presets.test.ts` (AC-23) |
| M1.6 Worker + store + hook | `_workers/stats.worker.ts`, `_hooks/useJudgewrightWorker.ts`, `_store/useToolStore.ts`, `_store/useAuthPromptStore.ts` | `useToolStore.test.ts` (AC-24, **AC-38** abort returns to configure-key), `useJudgewrightWorker.test.ts` (AC-27, **AC-31** crash ⇒ degrade, **AC-33** empty ⇒ demo seed) |
| M1.7 UI shell + report card | `page.tsx`, `_components/SiteHeader.tsx`, `_components/TopToolbar.tsx`, `_components/StationHeader.tsx`, `_components/MainWorkspacePane.tsx`, `_components/ReportCardPane.tsx`, `_components/HeadlineCard.tsx`, `_components/ConfusionHeatTable.tsx`, `_components/StatusLiveRegion.tsx`, `_components/ThemeToggle.tsx`, **`_components/Toaster.tsx`**, `_components/providers/ThemeProvider.tsx`, **`lib/utils.ts`** (`copyTextToClipboard`), `_components/ui/*` | `uikit.test.ts` (AC-22), `toaster.test.tsx` (lime/rose semantics), `e2e/smoke.spec.ts` (AC-20/21/23), `e2e/visual.spec.ts` (AC-21 class assertions) |
| M1.8 Education content | `_lib/guide.ts`, `_lib/faq.ts`, `_components/KnowledgeHub.tsx`, `_components/FaqSection.tsx`, `_components/CompetitorMatrix.tsx`, `_components/StudioFooter.tsx` | FAQ JSON-LD single-source test, `content.test.ts` (**AC-56**: every digit in content carries a citation tag), `e2e/smoke.spec.ts` |

**M1 exit:** paste a binary JSONL → live confusion matrix + agreement + **unweighted** κ +
grade, in the worker, dual-theme, zero egress, the global Toaster mounted.

### M2 — α, chance baseline, Δκ headline, bootstrap CIs, grade, payload split
Depends on M1 (report core + worker contract stable).

| Task | Files owned | Test |
|---|---|---|
| M2.1 Krippendorff α | `_lib/krippendorffAlpha.ts` | `krippendorffAlpha.test.ts` (AC-06…AC-08, **AC-43/44/45** level guards, **AC-34** single critic + **AC-50** disclosures) |
| M2.2 Chance baseline | `_lib/chanceBaseline.ts` | `chanceBaseline.test.ts` (**AC-09** generalized: `baselineKappa === 0` for random label sets across base rates 0.05–0.99, via the analytic identity) |
| M2.3 Seeded bootstrap | `_lib/bootstrapCI.ts`, `_lib/rng.ts` (extend), `_lib/types.ts` (extend, via A-core) | `bootstrapCI.test.ts` + `bootstrapCI.repro.test.ts` (AC-13, **AC-49** index resampling + permuted control, **AC-53** tier boundaries) |
| M2.4 Grade bands | `_lib/grade.ts` | `grade.test.ts` (AC-26 incl. **AC-57** negative-κ band "F" / "worse than chance") |
| M2.5 Wire into report | `_lib/report.ts`, `_lib/types.ts` (extend) | `report.test.ts` (AC-10 full headline with baseline **0.94**, **AC-39** adjacent-error fixture: deflation 0.131 and grade-of-unweighted, AC-28) |
| M2.6 α + CI panels | `_components/AlphaPanel.tsx`, `_components/HeadlineCard.tsx` (extend), `_components/ReceiptBlock.tsx`, `_components/TopToolbar.tsx` (positive-class + score-mode controls) | `reportRender.test.ts` (receipt content **incl. AC-52** `{seed,B,deadlineMs,ciDropped,reason,engine}` and **AC-53** tier copy; κ<0 copy **AC-57**), `e2e/demos.spec.ts` |
| M2.7 Worker payload split + LRU | `_workers/stats.worker.ts`, `_hooks/useJudgewrightWorker.ts`, `_lib/types.ts` (extend, via A-core) | `useJudgewrightWorker.test.ts` (AC-27 + window `≤ MAX_TABLE_ROWS` with honest `totalCount`, on-demand pull for export/LLM); `e2e/perf.spec.ts` (**AC-59**, perf-gated 200k-with-critiques frame-gap probe) |
| M2.8 α bootstrap in the shared loop + the §1.8 measurement | `_lib/bootstrapCI.ts` (`bootstrapBundle`, `BOOTSTRAP_ALPHA_B`), `_lib/report.ts` | `bootstrapCI.test.ts` (timed, **AC-61**, perf-gated); measurements recorded in `PLAN.md` §1.8 **and** `BENCHMARKS.md` before M2 exit; the report carries `alphaReplicates` |

**M2 exit:** headline prints agreement + **unweighted** κ + Δκ + always-pass baseline + CIs;
α panel with level selector, disclosures, human ceiling and the α-specific tier; the worker
payload is split (summary + window) and the full rows travel only on demand.

### M3 — ECE/Brier, bias panel, disagreement table
Depends on M2 (report core).

| Task | Files owned | Test |
|---|---|---|
| M3.1 Calibration | `_lib/calibration.ts` | `calibration.test.ts` (AC-11/12 under `p-positive`, **AC-40** the two modes differ on the same fixture, **AC-41** mismatch detector + copy, **AC-37** out-of-range score treated as absent, **FM-15** ambiguous column ⇒ not computable) |
| M3.2 Bias metrics | `_lib/biasMetrics.ts` | `biasMetrics.test.ts` (all four FM-13 branches) |
| M3.3 Wire into report | `_lib/report.ts`, `_lib/types.ts` (extend) | `report.test.ts` (extended; **AC-36** duplicate ids stay independent) |
| M3.4 Disagreement table | `_components/DisagreementTable.tsx`, `_lib/reportRender.ts` (JSONL) | `e2e/disagreements.spec.ts` (**AC-16**: 250-row fixture attaches 250 `tbody tr`; 5,000-row fixture attaches 2,000 `tbody tr` + honest strip + one-viewport virtualised window), `reportRender.test.ts` |
| M3.5 Calibration/bias panels | `_components/CalibrationPanel.tsx`, `_components/BiasPanel.tsx` | `e2e/demos.spec.ts` |
| M3.6 Export bar | `_components/ExportBar.tsx`, `_lib/reportRender.ts` (markdown + one-liner + receipt) | `reportRender.test.ts` (AC-10 rendered string, **AC-55** golden one-line verdict at 17 sig figs), `e2e/copy.spec.ts` (**AC-54** ⌘⇧C + toast colours) |

**M3 exit:** every deterministic feature of §2.3/§2.4 in SPEC is visible and tested.

### M4 — Optional LLM diagnosis (BYOK) + auth-gated conveniences
Depends on M3 (export + disagreement selection needs the report).

| Task | Files owned | Test |
|---|---|---|
| M4.1 Diagnosis module | **`_services/llmDiagnosis.ts`** (moved out of `_lib` — the BAR §8 exception, documented in `AGENTS.md` at M5.5) | `llmDiagnosis.test.ts` (AC-17/18 incl. key absent from **every** store snapshot and `localStorage`, **AC-38** abort ⇒ `DiagnosisError("aborted")` + configure-key state; injected fake fetch) |
| M4.2 Diagnosis UI | `_components/DiagnosisPanel.tsx`, `_store/useToolStore.ts` (diagnosis state, `llmKey` transient) | `useToolStore.test.ts` (key never persisted) |
| M4.3 CSP relaxation | `next.config.ts` (`connect-src` + `https://openrouter.ai`, both from `DECLARED_ORIGINS`) | `csp.test.ts` (static: every `connect-src` origin ∈ `DECLARED_ORIGINS`), `e2e/smoke.spec.ts` allow-list derived from the same constant |
| M4.4 Auth no-op gate | `_lib/authGate.ts`, `_lib/supabaseClient.ts`, `_components/auth/*`, `_hooks/useAuth.ts`, `_hooks/useKeyboardShortcuts.ts` | `authGate.test.ts`, degraded-`localStorage` + no-`window` paths |
| M4.5 Command palette | `_components/CommandPalette.tsx`, `_components/SignInModal.tsx` | `e2e/smoke.spec.ts` (⌘K, ⌘P, ⌘↵ chords of `AC-54`) |

**M4 exit:** the one opt-in call works against a mocked fetch in CI, no-ops cleanly without a
key, aborts mid-flight into the configure-key state, and the default path still shows zero egress.

### M5 — Polish, theme verification, benchmarks, CI, release artifacts
Depends on M4.

| Task | Files owned | Test |
|---|---|---|
| M5.1 Design-system sweep | `_components/**` (dual-theme pass), `app/globals.css`, `tailwind.config.ts` | `uikit.test.ts` (AC-22), Playwright both themes |
| M5.2 Performance + watchdog | `_hooks/useJudgewrightWorker.ts`, `_workers/stats.worker.ts`, benchmark dataset control in `_components/TopToolbar.tsx` + `_lib/presets.ts` | `e2e/perf.spec.ts` (**AC-19**: default clause always runs — full correct report, zero uncaught errors, generous bound; **(b) perf-gated** ≤ 2.5 s / no frame gap > 100 ms / ≥ 55 fps) |
| M5.3 Coverage gates | `vitest.config.mts` | `npm run test:coverage` (AC-25) |
| M5.4 Ops artifacts | `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `deploy.sh`, `.dockerignore`, `ecosystem.config.cjs` | port pinned in every file (3005) |
| M5.5 Docs set | `README.md`, **`AGENTS.md`**, `docs/DESIGN.md`, `docs/blueprint.md`, `docs/surface-brief.md`, `docs/PRODUCT.md`, `docs/ui-kit.md`, `design_tokens.json`, `tutorial.md`, `CHANGELOG.md`, `LICENSE` | docs-sync check script; §10 bar re-check; **`AGENTS.md` MUST state (a) the `_services/llmDiagnosis.ts` BAR §8 exception so a Phase-4 auditor sees it is deliberate, and (b) the no-transcendentals rule for `_lib/`** (m8/M13) |
| M5.6 Beat-the-bar | `BENCHMARKS.md`, `QUALITY_REPORT.md`, `RELEASE_CHECKLIST.md`, `.github/workflows/ci.yml`, **`scripts/oracle.mjs`, `scripts/oracle.py`**, `fixtures/oracle-*.json` | differential oracle fixtures in CI: **non-blocking** job regenerates the oracles and diffs (`python3 scripts/oracle.py` with pinned scikit-learn + `node scripts/oracle.mjs`; exact command in `BENCHMARKS.md`); **non-blocking** `PW_PERF=1` job runs the perf-gated criteria (AC-15b/19b/59/61); `npm run bench` measures the report in **both node and a real Worker**, and both sets of numbers are recorded in `BENCHMARKS.md` |
| M5.7 Bar exit gate | (read-only audit of all 18 items) | `ORCHESTRATION/BAR.md` §10 pass/fail table in `QUALITY_REPORT.md`; **Phase-4 gate:** every arXiv ID in user-facing copy (2606.19544, 2606.00093) is recorded as resolving, with URL + fetch date, or the copy is softened to attribution-only (m13/AC-56) |

---

## 4. Phase-3 file ownership (disjoint by construction)

| Agent | Owns | Never touches |
|---|---|---|
| **A-core** | `_lib/{types,rng,parse,csv,labels,confusionMatrix,cohensKappa,krippendorffAlpha,chanceBaseline,bootstrapCI,calibration,grade,biasMetrics,report,reportRender,presets,guide,faq}.ts` + `_lib/__tests__/**` | `_components`, `_store`, `_workers`, `_hooks`, `app/`, config |
| **B-app** | `_workers/stats.worker.ts`, `_hooks/*`, `_store/*`, **`_services/llmDiagnosis.ts`**, `_lib/authGate.ts`, `_lib/supabaseClient.ts` + their tests | `_components/**`, `_lib` stats modules owned by A-core |
| **C-ui** | `app/tools/judgewright/**` (page + `_components/**` + `__tests__/**`), `app/globals.css`, `tailwind.config.ts`, **`lib/utils.ts`**, `app/sitemap.ts`, `app/robots.ts` | `_lib/**`, `_store/**`, `_workers/**`, `_hooks/**` |
| **D-ops** | `package.json`, `tsconfig.json`, `next.config.ts`, `playwright.config.ts`, `vitest.config.mts`, `eslint.config.mjs`, `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `deploy.sh`, `.dockerignore`, `.env.example`, `ecosystem.config.cjs`, `.github/**`, `e2e/**` | `_lib/**`, `_components/**`, `_store/**`, `_workers/**`, `docs/**` |
| **E-docs** | `README.md`, `AGENTS.md`, `docs/**`, `design_tokens.json`, `tutorial.md`, `BENCHMARKS.md`, `QUALITY_REPORT.md`, `RELEASE_CHECKLIST.md`, `CHANGELOG.md`, `LICENSE`, **`scripts/oracle.mjs`, `scripts/oracle.py`**, `fixtures/**` | any code file |

If two agents need the same file (e.g. `_lib/types.ts` grows during M2), **A-core owns it** and
the requesting agent files a one-line request into the board; the owner writes the change.

---

## 5. Test-first ordering inside each task

1. Red: write `_lib/__tests__/<module>.test.ts` with the reference values from
   `SPEC.md` §6 and the `fixtures/` oracle JSON.
2. Green: implement until the suite passes.
3. Wire: extend the worker envelope in `_lib/types.ts` → pass through
   `stats.worker.ts` → settle inside `applyComputation()` (one atomic `set()`).
4. Render: consume from the store; every control gets the five states.
5. Journey: extend the Playwright spec that covers the flow.

No task is "done" with a red suite, and no suite is allowed to be skipped to go green.

---

## 6. Risks & open questions for the reviewer

| # | Risk / question | Mitigation / recommendation |
|---|---|---|
| R1 | **arXiv citations are supplied, not independently re-verified by this planner.** Two IDs (2606.19544, 2606.00093) postdate my ability to fetch; the quoted figures are used verbatim from the task brief. | **Phase-4 gate (m13/AC-56):** both citations must resolve — URL + fetch date recorded in `QUALITY_REPORT.md` — before the numbers appear in user-facing copy; otherwise the copy is softened to attribution-only. Every third-party number carries a link and the words *cited, not computed by this tool*. |
| R2 | **α semantics when the judge is treated as a coder.** Including the judge in the panel makes α computable everywhere but mixes a human and a machine rater. | **Resolved (adjudicated): ship as designed** — the panel is `[judge, human₁, …]` (the judge is *not* dropped), with `alphaHumans` as the human ceiling and the mandatory 2-coder disclosure + κ-bands label (`AC-50`). The SPEC/ARCHITECTURE copy states the two coefficients differ by construction. |
| R3 | **Grade bands are a convention, not a standard.** Landis–Koch labels are a convenience mapping. | Bands are the Landis–Koch convention applied to **unweighted** κ, printed next to the letter, the mapping is a documented table, and the UI says *"bands are a convention — the numbers are the product"*. |
| R4 | **`B` tiering is deterministic but wall-clock dependent in the failure case**: a >2.5× slower machine can trip the deadline and drop CIs. | Tier table has ≥ 2.7× headroom; the abort path is explicit, honest, visible in the receipt (`{deadlineMs, ciDropped, reason, engine}`), and covered by `FM-7` / `AC-32` / `AC-52`. **Policy: the deadline may abort CIs; it never changes a number.** |
| R5 | **Determinism across engines.** All arithmetic is IEEE-754 double; a different engine could differ by 1 ULP. | `_lib/` uses no transcendentals (lint + purity test, `AC-60`); assertions use 1e-12 tolerances against references and bit-exactness only *within* Judgewright's own outputs (17 significant digits). |
| R6 | **CSV edge cases** (BOM, `\r\n`, quoted newlines, embedded quotes) are easy to get subtly wrong. | M1.3 owns a dedicated RFC4180 tokenizer with fixture coverage for every case; `AC-28` pins JSONL ≡ CSV output equality. |
| R7 | **The disagreement table at 2,000 displayed rows** can still cost layout time. | Cap + virtualised window; the e2e `AC-16` renders 250 and 5,000-row fixtures and asserts only `tbody tr` counts plus the one-viewport window; the worker payload ships the window, never the full array. |
| R8 | **BYOK key in a browser is inherently in-memory only.** Reload drops it. | Documented as a privacy feature ("your key is never stored"), never persisted, purged explicitly. |
| R9 | **OpenRouter API drift** (response shape, model ids). | The response is validated field-by-field; `format` errors never surface raw model output; the endpoint/model are constants in `_services/llmDiagnosis.ts`. An aborted request degrades to the configure-key state (`AC-38`). |
| R10 | **Bundle budget (≤ 200 kB)** with the full component set. | The LLM path and any heavy deps are lazily imported; the worker is a separate chunk; `BENCHMARKS.md` records the measured First Load JS. |
| R11 | **α bootstrap cost was never measured** (the review's C6 finding) — the shared loop could trip the deadline at large tiers. | §1.8 makes the measurement mandatory before M2 exit; the shared loop uses one RNG stream and one index array; the α-specific tier (`min(B, 250)` above 50k rows) and `alphaReplicates` disclosure are pre-wired; `AC-61` asserts the measured run fits the deadline on the reference machine with the ≥2.5×-slower escape hatch. |
| R12 | **Score-mode semantics** (`p-positive` vs `confidence`) can be silently wrong. | No auto-detect (decided); the mode is a labelled control, both modes' ECE/Brier are computable, and the mismatch detector surfaces *"your scores look like confidences, not probabilities"* when they diverge by > 0.05 (AC-40/41). |
| R13 | **Duplicate `example_id`** could silently double-count a skewed sample. | Decided: rows are independent examples; the parse warning lists the ids and the receipt documents the count (AC-36). |

## 7. Definition of done (per milestone)

1. All five green gates pass locally in the fixed order.
2. New behavior has a failing-then-passing unit test (TDD) and, where user-visible, an e2e.
3. `SPEC.md` §6 criteria touched by the milestone are green and named in the commit message.
4. `QUALITY_REPORT.md` gap list updated — including anything knowingly left open.
