# Judgewright — Blueprint

Architecture companion to [`AGENTS.md`](../AGENTS.md). The axioms are the contract; this file
explains how the pieces actually work and where the next milestone plugs in.

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
| Watchdog | `WATCHDOG_MS = 1500`. On fire: terminate the worker, clear the timer, bump the request id (so a zombie reply is stale by definition), respawn through the single factory, settle "Execution aborted — the compute budget was exceeded". |
| Respawn | Always via `spawnWorker()` — the only place `new Worker(...)` exists, so initial mount and respawn cannot diverge. |
| Degradation | `onerror`, `onmessageerror` and a spawn failure all funnel through `degradeToMainThread()`: kill timers, terminate, set `isWorkerAvailable = false`, announce once, settle synchronously through the same core with `degraded: true`. |
| Announcements | Success trails `SUCCESS_ANNOUNCE_DEBOUNCE_MS = 800`; errors settle immediately so a stale success never follows a rejection. |

Because the placeholder core is far cheaper than the budget, the watchdog never fires in
practice today. That is intentional: the scaffold proves the plumbing, and the statistics
milestone inherits it unchanged.

## 3. The compute seam — `_lib/analyze.ts`

```ts
analyzeVerdicts(verdictsText, { deadlineMs, engine }) => AnalysisOutcome
// { ok: true, stats: PlaceholderStats } | { ok: false, error: string }
```

Today it computes character / word / byte / line counts plus an echo. The statistics milestone
replaces the **body** — never the signature — with:

```
parseVerdicts() → buildMatrix() → cohensKappa() → krippendorffAlpha()
→ establishment() → bootstrapCIs() → grade() → computeReport()
```

The envelope, the worker, the hook, the store and the report card all survive that swap
untouched. That is the entire point of the seam.

**Why an echo at all?** It is the honest "proof of life" for the shell: the pane mirrors back
exactly what it analyzed, so the paste → worker → render leg of the journey is observable end
to end before any real statistic exists. The real report card replaces it; nothing else moves.

## 4. State model — `_store/useToolStore.ts`

| Slice | Persisted? | Notes |
|---|---|---|
| `verdictsText`, `rubric`, `settings` | **yes** | The only persisted content (`judgewright-tool-storage`, v1). `partialize` enforces exactly these three keys — the e2e suite asserts the shape. |
| `stats` | no | The settled report. Becomes the full `CalibrationReport` at M1/M2. |
| `isProcessing`, `errorMessage`, `isWorkerAvailable`, `degraded` | no | Pipeline telemetry. `isWorkerAvailable` is `null` until the first settle — `null` must never render "ready". |
| `isCommandPaletteOpen`, `isSamplesOpen`, `statusAnnouncement` | no | Transient UI chrome. |

`applyComputation(result, { announce })` is the **atomic settle**: one `set()` flips stats,
error and degraded together, so a consumer never renders a half-updated frame.

`merge` repairs shape drift (v0 → v1 stays future-proof) while honoring `skipHydration` +
explicit rehydrate-on-mount, which is what keeps the server HTML and the first client paint in
agreement.

## 5. Failure modes (ARCHITECTURE §8, scaffold-reachable today marked ✓)

| # | Failure | Where handled | Scaffold |
|---|---|---|---|
| FM-5 | Paste over `MAX_INPUT_CHARS` | `analyzeVerdicts` returns a capacity **value** | ✓ unit-tested |
| FM-6 | Worker crash / clone failure | `useToolWorker` degrade path → amber banner | ✓ e2e-proven with a broken `Worker` |
| FM-7 | Deadline trips | Disclosed in the receipt; point statistics never change | budget wired |
| FM-1 | Malformed rows | Parse-time counting + disclosure | M1 |
| FM-17 | Every row invalid | `report == null` → whole error card, never zeroed stats | M1 |

## 6. Privacy & egress

- `connect-src` is generated from `DECLARED_ORIGINS` (`_lib/constants.ts`) so the header and
  the docs cannot drift; a static unit test asserts the shipped CSP allows nothing outside that
  list.
- The default path discharges **zero** non-localhost requests. `AUTO_DIAGNOSIS_ENABLED` is
  `false`, the toolbar labels the state "auto-diagnosis off", and the e2e request guard fails
  CI on any external request during first paint **and** a full compute.
- Fonts are fetched at build time by `next/font/google` and served from the app origin — no
  font origin exists at runtime (the README caveat the bar requires).

## 7. Seam map for the statistics milestone

| Today | Becomes | Notes |
|---|---|---|
| `_lib/analyze.ts` | `_lib/report.ts` (+ `parse.ts`, `matrix.ts`, `kappa.ts`, `alpha.ts`, `baseline.ts`, `bootstrap.ts`, `score.ts`) | Keep `AnalysisOutcome`-shaped returns; errors stay values. |
| `PlaceholderStats` | `CalibrationReport` (`CalibrationReportSeam` in `types.ts` is the starting shape) | Receipt fields: n, rowCount, seed, B, budget, budgetAborts, engine, computeMs, artifactCacheState. |
| `_lib/constants.ts` | `_lib/limits.ts` (rename optional) | Same file, same values — the import site does not move. |
| `_hooks/useToolWorker.ts` | `_hooks/useJudgewrightWorker.ts` | The checkpoint guard (`useSyncExternalStore`) is added here with a `/r` key. |
| `stats: \| null` | `report: \| null` | Only the field name changes; `applyComputation` stays. |
| Report card placeholder | Full report card | Already in place, already titled, already honest. |

## 8. Testing strategy

| Suite | Proves |
|---|---|
| `_lib/__tests__/analyze.test.ts` | The core's arithmetic, echo cap, capacity error value, determinism. |
| `_lib/__tests__/authGate.test.ts` | Offer-never-lock policy; degraded `localStorage`; no-`window` purity. |
| `_lib/__tests__/presets.test.ts` | The seeded first run is never blank and every row is parseable. |
| `_lib/__tests__/supabaseClient.test.ts` | Env-gated no-op, lazy singleton, memo reset. |
| `_lib/__tests__/content.test.ts` | Education prose carries no uncited number. |
| `_lib/__tests__/csp.test.ts` | Static half of the zero-egress proof. |
| `e2e/smoke.spec.ts` | Journey: redirect, landmarks, worker round trip (counts recomputed independently), persistence scoping, `⌘K`, `⌘P`. |
| `e2e/demos.spec.ts` | Worker round trip including the debounce tier, theme flip, `⌘⇧C` + clipboard read-back, rose failure toast, degraded banner with identical numbers, clear. |
| `e2e/visual.spec.ts` | Layout contract (390/1440, no overflow, single column), FAQ JSON-LD zero-drift, zero-external-request guard. |

## 9. Ops artifacts

| File | Role |
|---|---|
| `Dockerfile` | 3-stage build, non-root runner, port 3005 healthcheck |
| `docker-compose.yml` | `127.0.0.1:3005:3005`, resource limits, log rotation |
| `Caddyfile` | `judge.norai.tech` → `judge-norai:3005` with auto-TLS |
| `ecosystem.config.cjs` | PM2 `judge-norai`, `127.0.0.1:3005`, memory ceiling |
| `deploy.sh` | SHA-gated: refuses without `DEPLOY_CONFIRM=1` |
| `.github/workflows/ci.yml` | typecheck → lint → unit → build → Playwright |
