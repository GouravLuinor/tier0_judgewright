# Judgewright — Blueprint

Architecture companion to [`AGENTS.md`](../AGENTS.md). The axioms are the contract; this file
explains how the pieces actually work. The milestones it used to defer have all landed — what
remains open is listed in [`QUALITY_REPORT.md`](../QUALITY_REPORT.md).

---

## 1. Layer rules (BAR §4.7)

```
page.tsx ──► _components ──► _store ──► (transient pipeline state)
                    │
                    └──► _hooks/useToolWorker ──► _workers/compute.worker.ts
                                                          │
                                                          └──► _lib/*   (pure)
```

- `_lib/` is pure: no React, no DOM, no `localStorage`, no `fetch`. This is what lets **the
  same core** run inside the worker and on the main thread.
- `_workers/compute.worker.ts` imports only `_lib/`.
- `_components/` may import `_lib/`, `_store/`, `_hooks/` — never the reverse.
- `types.ts` holds **zero runtime imports**; anything the worker and the UI share starts there.

## 2. Worker protocol

`_hooks/useToolWorker.ts` owns:

| Concern | Behaviour |
|---|---|
| Request ids | Monotonic counter; a reply with an older id is dropped by the stale-response guard before it can touch state or the watchdog. |
| Adaptive debounce | `>200,000 → 250ms` · `>20,000 → 120ms` · `>5,000 → 40ms` · else `0ms`. |
| Watchdog | **Tiered by payload size** — `watchdogMsFor(chars)`: `≤20,000 → 1,500ms` · `≤200,000 → 3,000ms` · `≤2,000,000 → 5,000ms` · above → `8,000ms` (`WATCHDOG_MS` is the small-paste wall). On fire: terminate the worker, clear the timer, bump the request id (so a zombie reply is stale by definition), respawn through the single factory, and settle the error **atomically** — the stats and the window are cleared in the same `set()` that records it (A5). |
| Respawn | Always via `spawnWorker()` — the only place `new Worker(...)` exists, so initial mount and respawn cannot diverge. |
| Degradation | `onerror`, `onmessageerror` and a spawn failure all funnel through `degradeToMainThread()`: kill timers, terminate, set `isWorkerAvailable = false`, announce once, settle synchronously through the same core with `degraded: true`. |
| Announcements | Success trails `SUCCESS_ANNOUNCE_DEBOUNCE_MS = 800`; errors settle immediately so a stale success never follows a rejection. |

The tiering exists (A2) because a flat 1.5 s wall aborted legitimate 200k-row dispatches,
which the "an in-cap input always settles a report" contract forbids. Measured: a 200k
dispatch takes a median 1,011 ms (narrow payload) to 1,361 ms (wide) against an 8,000 ms
tier — see [`BENCHMARKS.md`](../BENCHMARKS.md). The watchdog is the hang guard; the
1,000 ms cooperative deadline is what decides whether the bootstrap CIs survive, and a trip
drops CIs only, never a point statistic.

## 3. The compute seam — `_lib/analyze.ts`

```ts
analyzeVerdicts(verdictsText, { deadlineMs, engine }) => AnalysisOutcome
// { ok: true, stats: VerdictAnalysis } | { ok: false, error: string, issues: ParseIssue[] }
```

**Landed (D1 → D3, all shipped):** the seam parses verdicts (`_lib/parse.ts` + `_lib/csv.ts`),
normalizes the label vocabulary (`_lib/labels.ts`), builds the confusion matrix and the
binary / k-class metrics (`_lib/confusionMatrix.ts`), computes the UNWEIGHTED Cohen's κ
through the integer-rational fast form `(A·n − S)/(n² − S)` plus the weighted linear and
quadratic secondary rows (`_lib/cohensKappa.ts`), computes Krippendorff's α at all three
levels with their guards (`_lib/krippendorffAlpha.ts`), derives the always-majority chance
baseline (`_lib/chanceBaseline.ts`), runs the seeded percentile bootstrap
(`_lib/bootstrapCI.ts`), grades the unweighted κ (`_lib/grade.ts`), computes ECE/Brier
(`_lib/calibration.ts`) and the position/verbosity bias (`_lib/biasMetrics.ts`), builds the
per-example rows (`_lib/disagreements.ts`), and renders the report, the exports and the
receipt (`_lib/report.ts` + `_lib/reportRender.ts`):

```
parseVerdicts() -> confusionMatrix() -> cohensKappa() [unweighted headline + linear + quadratic]
  -> krippendorffAlpha() [nominal/ordinal/interval] -> chanceBaseline() -> grade()
  -> calibrationPanel() [ECE + Brier, two score modes] -> biasMetrics()
  -> buildDisagreementRows() -> bootstrapBundle() [accuracy + kappa + alpha, one resample]
  -> computeReport() -> renderReceipt() / renderMarkdownReport() / renderOneLineVerdict()
```

The envelope, the worker, the hook, the store and the report card survived every step of
that growth untouched. That is the entire point of the seam.

**What replaced the echo:** the honest paste counts (characters / words / bytes / lines of the
WHOLE paste) ride along in `VerdictAnalysis` beside the report, so the status strip and the
pane's count tiles keep their contract; the pane's proof-of-life is now the report card itself
— raw agreement, the unweighted κ, the chance baseline and the reproducibility receipt.

## 4. State model — `_store/useToolStore.ts`

| Slice | Persisted? | Notes |
|---|---|---|
| `verdictsText`, `rubric`, `settings` | **yes** | The only persisted content (`judgewright-tool-storage`, v1). `partialize` enforces exactly these three keys — the e2e suite asserts the shape. |
| `stats` | no | The settled analysis (`VerdictAnalysis`), carrying the full `CalibrationReport`. |
| `isProcessing`, `errorMessage`, `isWorkerAvailable`, `degraded` | no | Pipeline telemetry. `isWorkerAvailable` is `null` until the first settle — `null` must never render "ready". |
| `isCommandPaletteOpen`, `isSamplesOpen`, `statusAnnouncement` | no | Transient UI chrome. |

`applyComputation(result, { announce })` is the **atomic settle**: one `set()` flips stats,
error and degraded together, so a consumer never renders a half-updated frame.

`merge` repairs shape drift (v0 → v1 stays future-proof) while honoring `skipHydration` +
explicit rehydrate-on-mount, which is what keeps the server HTML and the first client paint in
agreement.

## 5. Failure modes (ARCHITECTURE §8)

All nineteen are implemented; the full table with the shipped copy is in
[`ARCHITECTURE.md`](../ARCHITECTURE.md) §8. The five the original blueprint tracked as
milestone-open are now landed and covered:

| # | Failure | Where handled | Status |
|---|---|---|---|
| FM-5 | Paste over `MAX_INPUT_CHARS` | `analyzeVerdicts` returns a capacity **value** | ✓ unit-tested |
| FM-6 | Worker crash / clone failure / watchdog | `useToolWorker` degrade path → amber banner, atomic settle | ✓ e2e-proven with a broken `Worker` |
| FM-7 | Deadline trips | Disclosed in the receipt; CIs dropped, point statistics never change | ✓ unit-tested |
| FM-1 | Malformed rows | Parse-time counting + the rows-skipped strip | ✓ 52 parse tests |
| FM-17 | Every row invalid | `report == null` → whole error card, never zeroed stats | ✓ unit-tested |

## 6. Privacy & egress

- `connect-src` is generated from `DECLARED_ORIGINS` (`_lib/constants.ts`) so the header and
  the docs cannot drift; a static unit test asserts the shipped CSP allows nothing outside that
  list.
- The default path discharges **zero** non-localhost requests. `AUTO_DIAGNOSIS_ENABLED` is
  `false`, the toolbar labels the state "auto-diagnosis off", and the e2e request guard fails
  CI on any external request during first paint **and** a full compute.
- Fonts are fetched at build time by `next/font/google` and served from the app origin — no
  font origin exists at runtime (the README caveat the bar requires).

## 7. Seam map — as landed

| Planned seam | Shipped as | Note |
|---|---|---|
| `_lib/analyze.ts` + a `report.ts` family | exactly that, plus `parse.ts`, `csv.ts`, `labels.ts`, `confusionMatrix.ts`, `cohensKappa.ts`, `krippendorffAlpha.ts`, `chanceBaseline.ts`, `bootstrapCI.ts`, `calibration.ts`, `grade.ts`, `biasMetrics.ts`, `disagreements.ts`, `reportRender.ts` | `AnalysisOutcome`-shaped returns kept; errors stayed values throughout |
| `PlaceholderStats` → `CalibrationReport` | `VerdictAnalysis` (the report + the honest whole-paste counts + the parse summary) | The receipt carries n, rowCount, seed, B, the budgets, `ciDropped` and the engine |
| `_lib/limits.ts` (rename optional) | **`_lib/constants.ts`** — the rename never happened and does not need to | One import site, asserted by `purity.test.ts` |
| `_hooks/useJudgewrightWorker.ts` | **`_hooks/useToolWorker.ts`** — the planned rename never happened | The hook gained the tiered watchdog, the atomic abort settle and the sync-parse budget (A2/A5/A10) |
| Report card | `ReportPane.tsx` + `ReportInsights.tsx` | headline + CIs, Δκ deflation, grade, confusion heat table, α panel, calibration panel, bias panel, receipt, windowed disagreement table |

Nothing here is a future tense any more. The two things that are *not* shipped are named in
[`QUALITY_REPORT.md`](../QUALITY_REPORT.md): the α-level and ECE-binning selector UI, and the
regenerated pixel baselines.

## 8. Testing strategy

24 suites / **361 tests**, node env. The ones this blueprint originally listed, plus what they
actually cover now:

| Suite | Proves |
|---|---|
| `_lib/__tests__/analyze.test.ts` (22) | The pipeline envelope, the honest paste counts, the capacity error value, the last-resort catch. |
| `_lib/__tests__/cohensKappa.test.ts` (21) | Reference values, the integer fast path, all three weightings, the single degenerate guard. |
| `_lib/__tests__/krippendorffAlpha.test.ts` (17) | The published worked example to 1e-12, and every level guard. |
| `_lib/__tests__/bootstrap.test.ts` (19) | Determinism, the tier table, the α tier, the cooperative deadline, the cross-process spawn. |
| `_lib/__tests__/parse.test.ts` (52) | The six parse error classes, JSONL + CSV, the BOM, ambiguity, duplicates, capacity. |
| `_lib/__tests__/purity.test.ts` (6) | No transcendentals, no IO outside the two browser-boundary modules, one definition per constant. |
| `_lib/__tests__/csp.test.ts` (10) | Static half of the zero-egress proof, `connect-src` **and** `img-src`. |
| `_lib/__tests__/authGate.test.ts` (10) | Offer-never-lock policy; degraded `localStorage`; no-`window` purity. |
| `_lib/__tests__/supabaseClient.test.ts` (6) | Env-gated no-op, lazy singleton, memo reset. |
| `_lib/__tests__/presets.test.ts` (6) | The seeded first run is never blank and every row is parseable. |
| `_lib/__tests__/content.test.ts` (5) | Education prose carries no uncited number. |
| `report.test.ts` (23), `reportRender.test.ts` (32), `calibration.test.ts` (17), `chanceBaseline.test.ts` (15), `confusion.test.ts` (12), `labels.test.ts` (18), `disagreements.test.ts` (8), `grade.test.ts` (5), `biasMetrics.test.ts` (5), `milestones.test.ts` (13) | The report semantics, the rendered strings at 17 sig figs, and every panel's not-computable path. |
| `_workers/__tests__/compute.worker.test.ts` (7) | The artifact LRU and the A13 fingerprint identity guard. |
| `_services/__tests__/llmDiagnosis.test.ts` (19) | The one-call contract, the disclosed payload, the A11 caps in both dimensions. |
| `_hooks/__tests__/useJudgewrightWorker.test.ts` (13) | Debounce tiers, the tiered watchdog, the degrade path. |
| `e2e/smoke.spec.ts` | Redirect, landmarks, the worker round trip, the D2 report card, persistence scoping, `⌘K`, `⌘P`, and the diagnosis never being automatic. |
| `e2e/demos.spec.ts` | Debounce tier, theme flip, `⌘⇧C` + clipboard read-back, rose failure toast, the degraded banner, the A1 quota guard, the A5 atomic abort. |
| `e2e/copy.spec.ts` | Every copy path and both toast variants. |
| `e2e/disagreements.spec.ts` | The window never masquerading as the total (AC-59). |
| `e2e/perf.spec.ts` | A 200k dispatch settles a report; the exported totals are the true counts. |
| `e2e/visual.spec.ts` | Layout contract (390/1440, no overflow, single column), FAQ JSON-LD zero-drift, zero-external-request guard. |

Plus `node --experimental-strip-types` entries run by `npm run repro:seed` and
`npm run repro:analyze`, which prove byte-identical output across processes.

## 9. Ops artifacts

| File | Role |
|---|---|
| `Dockerfile` | 3-stage build, non-root runner, port 3005 healthcheck |
| `docker-compose.yml` | `127.0.0.1:3005:3005`, resource limits, log rotation |
| `Caddyfile` | `judge.norai.tech` → `judge-norai:3005` with auto-TLS |
| `ecosystem.config.cjs` | PM2 `judge-norai`, `127.0.0.1:3005`, memory ceiling |
| `deploy.sh` | SHA-gated Docker/Caddy path: refuses without `DEPLOY_CONFIRM=1` |
| `scripts/serve-standalone.sh` | Boots the real standalone artifact for Playwright (`exec`s the server so no orphan holds 3005) |
| `scripts/bench.ts` | `npm run bench` — the reproducible pure-core benchmark |
| `.github/workflows/ci.yml` | typecheck → lint → unit → build → Playwright |
