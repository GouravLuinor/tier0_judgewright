# Changelog

All notable changes to Judgewright. Format: keep-a-changelog, semantic versioning.

## [1.0.0] — 2026-10-11

**The shipped product.** Judgewright is a complete, 100% client-side LLM-judge calibration
workbench: every deterministic measurement promised by the spec is implemented, gated and
documented against measured numbers. This entry records what ships, the hardening that
followed it, and the gaps that are disclosed rather than papered over.

### Added — statistics engine

- **Confusion matrix + metrics** (`_lib/confusionMatrix.ts`) — rows are the human labels,
  columns the judge labels, both sorted ascending; TPR/TNR/precision/PPV/FPR/F1 against an
  echoed positive class (default = the second sorted label, one-click override), per-label
  precision/recall/F1 + macro averages for k-class sessions. A zero denominator prints `—`,
  never `NaN`.
- **Cohen's κ** (`_lib/cohensKappa.ts`) — the **unweighted headline** via the integer-rational
  fast path `(A·n − S)/(n² − S)`, plus **weighted linear and quadratic** `1 − D_o/D_e`
  secondary rows that never feed the headline, the grade, the deflation or the CI. One
  degenerate guard before either path: a rater with fewer than two distinct labels ⇒ `null`
  with a reason.
- **Krippendorff's α** (`_lib/krippendorffAlpha.ts`) — nominal, ordinal (rank-distance δ) and
  interval (`δ = (v−v′)²`) over the panel `[judge, human₁, …]`, plus the human-ceiling α.
  Guards as values: interval on non-numeric labels ⇒ `null` + reason; ordinal without numeric
  labels or an explicit `labelOrder` ⇒ nominal **with a warning**, never a silent sort order.
  Reproduces the published 3-coder × 15-unit worked example exactly (nominal
  `0.691358024691358`, interval `0.8108448928121059`).
- **Chance baseline** (`_lib/chanceBaseline.ts`) — the always-majority dummy's agreement and
  the analytic `p_o = p_e` identity that makes its κ exactly `0`, so a κ near zero reads as
  "indistinguishable from always-pass". The Δκ-deflation headline (`accuracy − κ_unweighted`)
  prints beside the raw agreement in percentage points.
- **Seeded percentile bootstrap** (`_lib/bootstrapCI.ts`) — index resampling only, one
  `mulberry32` stream, one fused draw+accumulate pass so accuracy, κ and α come from the
  **same** resample. `B` is a pure function of the row count (≤50k→2,000 · ≤100k→1,000 ·
  ≤150k→500 · ≤200k→500), α budget `min(B, 250)` above 50k rows, always disclosed. Proven
  byte-identical **across processes** by `npm run repro:seed` / `npm run repro:analyze`.
- **Letter grade** (`_lib/grade.ts`) — Landis–Koch bands on the **unweighted** κ, disclosed
  everywhere as a convenience mapping, not a standard; κ < 0 ⇒ `F` + "worse than chance".
- **Calibration** (`_lib/calibration.ts`) — ECE + Brier with two **user-selected** score
  semantics (`P(positive)` default, `confidence`), never auto-detected; a likely mismatch
  raises an amber hint. A duplicated `judge_score` column is reported not computable rather
  than computed from an arbitrary alias.
- **Bias panel** (`_lib/biasMetrics.ts`) — position and verbosity bias, computed only from
  columns that are present, naming the missing one otherwise.
- **Disagreement table** (`_lib/disagreements.ts`) — per-example rows with both labels, both
  critiques, the scores and the source line number; a 2,000-row display window that always
  prints its scope, with the true full-set totals beside it.
- **Exports** (`_lib/reportRender.ts`) — markdown report card, one-line verdict, agreement
  JSONL and the reproducibility receipt, at 17 significant digits. Exports are ungated.

### Added — optional BYOK LLM diagnosis

- `_services/llmDiagnosis.ts` (the BAR §8 exception — the only IO module in the tool):
  exactly **one** OpenRouter call, fired only by an explicit click after the user pastes a
  key. Off by default (`AUTO_DIAGNOSIS_ENABLED === false`); abortable mid-flight; ephemeral —
  the key lives in React state, never in a store snapshot or `localStorage`. ≤25
  disagreement rows selected deterministically (confusion-cell frequency, round-robin across
  distinct cells), each field excerpted to a disclosed 2,000-character cap, and the response
  capped in both dimensions (32 items × 2,000 characters).

### Changed — hardening after the feature complete

- **Quota-safe persistence (A1):** the persisted slice is bounded
  (`MAX_PERSISTED_TEXT_CHARS` = 1,000,000). An over-quota paste is not written at all instead
  of throwing `QuotaExceededError` out of the store's `set()` and unmounting the tree — the
  session keeps computing, and the reload story is honest.
- **Tiered watchdog (A2):** `watchdogMsFor(chars)` steps 1,500 / 3,000 / 5,000 / 8,000 ms by
  payload size, so an in-cap 200k-row dispatch settles (measured 1,011–1,361 ms against an
  8,000 ms tier) instead of being aborted at the small-paste wall. The cooperative budget is
  an **absolute** timestamp taken before the parse, so the parse is inside it.
- **Truthful export totals (A3):** the settled report carries the same 2,000-row window on
  both engines, and `agreementTotal` / `disagreementTotal` are the true full-set counts — a
  window count can never masquerade as a total.
- **α `isFinite` guard:** a non-finite replicate no longer poisons the α CI.
- **Atomic abort settle (A5):** the watchdog abort and the unexpected-throw path clear stats
  and record the error in **one** `set()`, so a stale stat card never renders beside a
  rejection.
- **BOM + JSONL fixes** and an `img-src` tighten (no third-party image origin at all).
- **Honest degraded copy:** the amber banner names which numbers are identical and which
  intervals were capped by the stricter sync budget.
- **Sync-parse budget (A10):** on the main-thread fallback only, the parse carries the same
  absolute budget, checked every 512 rows, and settles a `capacity` error value instead of
  freezing the thread.
- **LLM payload/response caps (A11)** as described above.
- **Calibration ambiguity (A12):** a duplicated `judge_score` slot makes the panel not
  computable.
- **Artifact-cache identity (A13):** an LRU hit must match a content fingerprint, so a 32-bit
  hash collision recomputes instead of serving the wrong report.
- **Cross-process reproducibility entries (A14):** `repro.entry.ts` and `repro.analyze.entry.ts`
  run under `node --experimental-strip-types`; the statistics core names its runtime
  dependencies with explicit `.ts` extensions, and `tsconfig.json` gains
  `allowImportingTsExtensions` accordingly.

### Added — tooling & docs

- `npm run bench` (`scripts/bench.ts` via `tsx 4.23.15`) — the reproducible pure-core
  benchmark: parse / point-statistics / κ+α-bundle / full-dispatch timings at 1k–200k rows,
  both payload widths, the A16 capacity probe, and the watchdog tier per payload.
- `npm run repro:seed` / `npm run repro:analyze` — the cross-process determinism entries.
- `README.md` regenerated as the shipped product (feature list, module tree from disk, real
  gate numbers, a truthful Limitations section). `BENCHMARKS.md` rewritten from measured
  output. `QUALITY_REPORT.md` rewritten with real gate records, the independent
  cross-verifications and an honest known-gaps list. `ARCHITECTURE.md` reconciled to the
  shipped tree, signatures, budgets and failure-mode copy. `RELEASE_CHECKLIST.md` rewritten
  with the `deploy@YOUR_SERVER_IP` flow, the exact nginx block, `certbot --nginx` and the
  PM2 `judge-norai` commands, with every irreversible step marked **AWAITING HUMAN
  APPROVAL**.

### Verified

- `npm run typecheck`, `npm run lint`, `npm test` (**361 passed / 24 files**),
  `npm run test:coverage` (statements 94.4% · branches 79.24% · functions 98.62% · lines
  96.77%), `npm run build` (`/tools/judgewright` = route 93 kB / **First Load JS 199 kB**),
  `npm run test:e2e` (**48 passed / 2 skipped**), `npm run bench` — all exit 0.
- Independently cross-checked: **κ (all three weightings) vs scikit-learn 1.9.1** — max abs
  difference **1.11e-16** (unweighted/linear) and **2.22e-16** (quadratic) over 112 panels,
  with the 7 one-constant-rater panels where the engine deliberately returns `null` and
  scikit-learn returns `0.0` identified exactly; **α vs the published worked example**
  (exact) and vs an independent implementation of the published formulas (max abs difference
  **3.33e-15** over 400 randomized unit sets at all three levels); **byte-identical bootstrap
  across processes**; **zero egress** on the default path; **key never persisted**;
  **quota safety on an 8.6 MB paste**; **a 200k dispatch settles, never an abort**.

### Version note

The version in `package.json` is left at `0.1.0` in this commit; the release entry above
names the **shipped capability set as 1.0.0**. Bumping the field is a one-line change the
human can make with the release tag — the docs and this changelog describe the shipped
feature set, not the field value.

### Known gaps (disclosed in QUALITY_REPORT.md)

- ~1 kB of First-Load JS headroom against the 200 kB budget.
- ≈190,000 critique-bearing rows is the real row ceiling (the two caps multiply); the exact
  number is a property of row width.
- No selector UI for the α level or the ECE binning: `ComputeOptions` carries them and the
  engine implements and guards them, but nothing in the UI sets them, so the engine runs
  nominal α + equal-width 10-bin ECE and the report card discloses which it used.
- The main-thread fallback carries a bounded parse (A10).
- Two Playwright pixel baselines stay skipped until a human regenerates the goldens.

## [Unreleased]

(nothing pending)

---

## Build history (pre-1.0.0)

A short, truthful record of the order things were built. The milestone-by-milestone detail
that used to sit here was removed because it restated, as current fact, claims that the
scaffold-stage builds made about themselves ("no statistics yet", "arithmetic deferred", "the
LLM diagnosis is not implemented"). Those statements were true only at the time; everything
they deferred is shipped and verified in 1.0.0 above, and what remains open is listed here and
in `QUALITY_REPORT.md`.

1. **Application shell** — the tool route at `/tools/judgewright` (root `/` redirects), the
   workstation layout, the command palette and keyboard chords, instant copy with the
   lime/rose toasts, the dual Matchlight theme, and the packaging (`output: "standalone"`,
   CSP + HSTS, PM2 `judge-norai` on 127.0.0.1:3005, Docker + Caddy in parallel, and the CI
   chain typecheck → lint → unit → build → Playwright).
2. **State + worker pipeline** — `_store/useToolStore.ts` persisting exactly
   `{ verdictsText, rubric, settings }` with `skipHydration` + explicit rehydrate and an
   atomic `applyComputation`; `_workers/compute.worker.ts` with monotonic ids, the
   stale-response guard and the artifact LRU; `_hooks/useToolWorker.ts` with the adaptive
   debounce tiers, the single `degradeToMainThread` fallback and the announce debounce.
3. **D1 — the statistics core** — the JSONL/CSV parser and the label-vocabulary rule, the
   confusion matrix and the binary/k-class metrics, unweighted Cohen's κ, the chance
   baseline, and the report card on the worker.
4. **D2 — uncertainty** — Krippendorff's α at all three levels, the weighted secondary κ rows,
   the seeded percentile bootstrap with the deterministic tier table, the letter grade, the
   Δκ-deflation headline and the per-example disagreement table.
5. **D3 — calibration, bias, exports, diagnosis** — ECE and Brier with the two score
   semantics, the position/verbosity bias panel, the export bundle, and the optional BYOK
   LLM diagnosis in `_services/`.
6. **A1–A17 hardening** — the quota-safe persist, the tiered watchdog, the truthful export
   totals, the α `isFinite` guard, the atomic abort settle, the sync-parse budget, the LLM
   payload/response caps, the calibration-ambiguity guard, the artifact-cache fingerprint,
   the BOM/JSONL fixes and the `img-src` tighten — all summarized in the 1.0.0 entry above.
7. **This commit** — the documentation pass: the README, benchmarks, quality report,
   architecture and release checklist regenerated against the shipped code and freshly
   measured numbers, plus `npm run bench` / `npm run repro:*` so the numbers are reproducible.

Gate numbers from the older milestone commits (e.g. 53 unit tests, 177 kB First Load JS, 25
e2e tests) are superseded by the 1.0.0 figures above and are recorded only in git history.
