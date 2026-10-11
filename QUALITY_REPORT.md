# Judgewright — Quality Report

Honest gate record for the **shipped v1.0.0**. Nothing here is aspirational: every number was
produced by running the command named beside it on this machine at this commit
(`3beea5e`, branch `main`), and where a bar item is not satisfied it is listed under
[Known gaps](#known-gaps-honest-list) with its reason — not smoothed over.

Run environment: **Node v24.13.0**, npm 11.8.0, Linux (WSL2), 12 × 13th Gen Intel Core
i7-13620H, 6.8 GiB RAM.

## Gate record

| # | Command | Exit | Evidence |
|---|---|---:|---|
| 1 | `npm run typecheck` (`tsc --noEmit`) | **0** | no output = zero errors under `strict` |
| 2 | `npm run lint` (`eslint .`) | **0** | no output = zero errors/warnings (`no-explicit-any` + `no-unused-vars` are `error`, not `warn`) |
| 3 | `npm test` (vitest, node env) | **0** | **361 passed / 361, 24 files**, 2.0 s |
| 4 | `npm run test:coverage` (v8, scoped to `_lib`) | **0** | statements **94.4%** · branches **79.24%** · functions **98.62%** · lines **96.77%** — all four above the configured thresholds (90/70/90/80) |
| 5 | `npm run build` (`next build`) | **0** | 6 routes, all static; `/tools/judgewright` = **route 93 kB / First Load JS 199 kB**; shared by all = 103 kB |
| 6 | `npm run test:e2e` (Playwright, real standalone artifact) | **0** | **48 passed, 2 skipped** (the documented pixel baselines), 3.4 min |
| 7 | `npm run bench` (`tsx scripts/bench.ts`) | **0** | see [BENCHMARKS.md](BENCHMARKS.md) for the recorded run |
| 8 | `npm run repro:seed` / `npm run repro:analyze` | **0** / **0** | cross-process digests byte-identical (below) |

Verbatim excerpts:

```
$ npm test
 Test Files  24 passed (24)
      Tests  361 passed (361)
   Duration  2.02s

$ npm run build
Route (app)                                 Size  First Load JS
┌ ○ /                                      136 B         103 kB
├ ○ /_not-found                            136 B         103 kB
├ ○ /icon                                  136 B         103 kB
├ ○ /robots.txt                            136 B         103 kB
├ ○ /sitemap.xml                           136 B         103 kB
└ ○ /tools/judgewright                     93 kB         199 kB
+ First Load JS shared by all             103 kB

$ npm run test:e2e
Running 50 tests using 1 worker
  48 passed (3.4m)
  2 skipped
```

Coverage is scoped by `vitest.config.mts` to `app/tools/judgewright/_lib/**/*.ts` (excluding
`__tests__`), i.e. the pure core — `_services`, `_hooks`, `_workers` and `_components` are not
in the denominator. The weakest core file on each axis, and how far above threshold it sits:

| Axis | Threshold | Measured | Weakest file |
|---|---:|---:|---|
| statements | 80% | **94.4%** | `reportRender.ts` 88.81% |
| branches | 70% | **79.24%** | `reportRender.ts` 63.49% |
| functions | 90% | **98.62%** | `report.ts` 75% (4 functions, 3 covered) |
| lines | 80% | **96.77%** | `grade.ts` 90% |

Every axis clears its threshold with margin. The uncovered lines are error, guard and
deadline paths — the kind of branch a behavioural test exercises end to end rather than a
line-coverage test.

## CI

`.github/workflows/ci.yml` runs, in this order: `npm ci` → typecheck (`npx tsc --noEmit`) →
lint → unit (`npm test`) → production build → `npx playwright install --with-deps chromium`
→ `npx playwright test`, and uploads `test-results/` + `playwright-report/` on failure. CI
pins **Node 22** (the local reference box runs 24.13 and is green on every gate above; CI
itself has not been executed from this session — only the same command chain, locally).
**There is no coverage job, no oracle job and no scheduled job in CI** — only the six steps above. Playwright
boots the real standalone artifact on port 3005 via `scripts/serve-standalone.sh` (which
`exec`s the server so no orphan holds the port across runs), not the dev server.

## What was verified independently

These are checks whose value comes from comparing against something *outside* the code under
test. Each one was executed for this report; the method is stated so it can be re-run.

### 1. Cohen's κ (all three weightings) vs scikit-learn

122 seeded fixtures (2–5 classes, n from 2 to 1,000, 72% agreement rate) were generated with a
fixed Python seed, scored by `_lib/cohensKappa.ts`, and compared against
`sklearn.metrics.cohen_kappa_score` (scikit-learn 1.9.1 / numpy 2.5.4):

| Weighting | Panels where the engine defines κ | max abs difference | bit-identical |
|---|---:|---:|---:|
| unweighted | 112 | **1.11e-16** | 83 / 112 |
| linear | 112 | **1.11e-16** | — |
| quadratic | 112 | **2.22e-16** | — |

The remaining 1e-16-scale residuals are one-ULP floating-point association differences, not
formula differences.

**The 10 panels where the engine returns `null` are the deliberate AC-42 guard, and the split
is exact and worth recording:** on 3 of them both raters are constant, and scikit-learn also
returns `NaN` (both agree the coefficient is undefined). On the other 7, exactly one rater is
constant and **scikit-learn returns `0.0`** via the `p_o = p_e` identity, while the engine
returns `null` with a reason. That is a deliberate semantic difference — a constant rater has
no chance-corrected coefficient to report — and the difference is verified to be *only* those
7 cases and nothing else.

### 2. Krippendorff's α vs the published worked example and an independent implementation

- **Published worked example.** The engine reproduces Krippendorff's 3-coder × 15-unit
  computational example (12 pairable units, 26 pairable values) **exactly**: nominal
  α = `0.691358024691358` (= 1 − 75/243) and interval α = `0.8108448928121059`
  (= 1 − 12/63.44). Both are pinned in `_lib/__tests__/krippendorffAlpha.test.ts`.
- **Independent implementation.** An implementation of the published formulas written from the
  definitions in Python (coincidence matrix with `1/(m_u − 1)` pair weighting, expected
  `n_v·n_v'/(n−1)`, and the three δ metrics) scored 401 randomized unit sets (2–4 coders, 2–5
  classes, 2–25 units) at all three levels: **400 of 401 sets define a coefficient at every
  level, max abs difference 3.33e-15 (nominal), 3.11e-15 (ordinal), 3.33e-15 (interval), and
  zero disagreements about which sets define a coefficient.** The one `null` is the
  degenerate constant-vocabulary set, where both sides agree α is undefined.

### 3. Byte-identical bootstrap across processes

`npm run repro:seed` spawns nothing and imports nothing the app does not: it runs
`_lib/__tests__/repro.entry.ts` under `node --experimental-strip-types` and prints the seeded
accuracy/κ/α CI triples at 17 significant digits. Two separate processes printed the `seed=42`
line **byte-for-byte identically** and the `seed=7` line differently (which rules out a
constant). `npm run repro:analyze` does the same for a whole settled report through
`analyzeVerdicts`. Both commands exit non-zero if the same input fails to reproduce itself or
if two different inputs collide. Digests are recorded in [BENCHMARKS.md](BENCHMARKS.md).

### 4. Zero egress

`e2e/visual.spec.ts` installs a request listener **before** navigation and fails the suite on
any non-localhost request during first paint **and** a full compute through the worker.
**Passing.** The Playwright config pins the Supabase env keys empty so the client is a `null`
no-op and no Supabase origin is even observable. `_lib/__tests__/csp.test.ts` is the static
half: it parses the shipped CSP and fails if any origin sits outside `DECLARED_ORIGINS`
(the same constant `next.config.ts` builds `connect-src` from), including the `img-src`
tightening. `_lib/__tests__/purity.test.ts` adds the structural guarantees: no transcendentals
in the core, no `fetch`/`localStorage`/DOM tokens outside the two documented browser-boundary
modules, and exactly one definition per constant.

### 5. The BYOK key is never persisted

`_services/__tests__/llmDiagnosis.test.ts` (19 tests) covers the one-call contract and the
disclosed payload; `e2e/smoke.spec.ts` covers the three UI-level guarantees with a mocked
transport: the default compute sends **zero** openrouter requests, with no key the button is a
configure-no-op that sends nothing (AC-17), and with a key, one click sends **exactly one**
mocked call (AC-18). The key lives in `DiagnosisPanel`'s React state — not in the store's
`partialize` (which persists exactly `{ verdictsText, rubric, settings }`), not in
`localStorage`, gone on reload.

### 6. Quota safety on an 8.6 MB paste

`e2e/demos.spec.ts` fills **120,000 rows (> 8,000,000 characters, ≈8.6 MB)** — beyond every
browser storage quota — with a `pageerror` listener armed. The report still settles to `ready`
with statistics and the honest character count, the persisted `localStorage` payload stays
under 10,000 characters (the over-quota paste is deliberately *not* written, so a reload does
not restore it), and `pageErrors` is empty: no `QuotaExceededError` escapes the store's
`set()` and unmounts the tree. A second test forces every storage write to throw and asserts
the session keeps computing.

### 7. A 200k dispatch settles — never an abort

`e2e/perf.spec.ts` fills a 200,000-row fixture engineered so every row disagrees (true totals
0 agreements / 200,000 disagreements, against a 2,000-row display window) and asserts: the
report reaches `ready` with no `#report-error-message` and no page error, the point statistics
settle over the full set, the receipt names the tier (`B 500`), the CIs are either present or
honestly dropped with the disclosed copy, and the table strip reads
`showing 2,000 of 200,000 rows`. The companion test proves the exported totals are the true
counts. The measured wall-clock reality behind that guarantee is in
[BENCHMARKS.md](BENCHMARKS.md): median 1,020 ms (narrow) / 1,329 ms (wide) against an 8,000 ms
watchdog tier, so the watchdog never fires and the report always settles.

### 8. Sibling-tool claim discipline

`ARCHITECTURE.md` describes the shipped tree, the real worker/hook filenames, the tiered
watchdog and the actual store fields. It no longer claims `_lib/rng.ts`, `_lib/limits.ts`,
`_workers/stats.worker.ts`, a second worker message protocol, a FAQ module, or the
`scripts/oracle.*` + `fixtures/oracle-*.json` + oracle CI job that the planning document
described — **none of those artifacts exist**, and a document claiming them is a defect of the
same kind as a wrong number.

## Bundle budget

First Load JS for `/tools/judgewright` is **199 kB** against the 200 kB ceiling from
`context.md` §4.1 — about **1 kB of headroom**, route 93 kB over a 103 kB shared chunk. Two
things keep it there: the tool ships **no animation runtime** (toasts and menus use the design
system's own CSS transitions, capped at 300 ms), and the diagnosis panel — the only module
that could pull in a network path — is loaded on demand, so it is never in the first paint.

## Known gaps (honest list)

| Gap | Why it is disclosed rather than hidden |
|---|---|
| **No selector UI for the α level or the ECE binning.** `ComputeOptions` carries `alphaLevel` (`nominal` / `ordinal` / `interval`) + `labelOrder` and `bins` / `binMode`, and the engine implements and guards all of them — but nothing in the UI sets them, so the engine runs **nominal α** and **equal-width, 10-bin ECE**. The report card names the level and the binning it actually used instead of letting a reader assume. The `judge_score` semantics selector and the positive-class selector *are* wired, because they change the meaning of a number already on screen. |
| **First-Load headroom is ~1 kB** (199 kB of the 200 kB budget). Any new first-paint dependency must displace something or be code-split. |
| **≈190,000 critique-bearing rows is the real row ceiling, not 200,000.** `MAX_ROWS` (200,000) and `MAX_INPUT_CHARS` (40,000,000) multiply, so the binding limit is `min(200,000, 40,000,000 ÷ chars-per-row)`. Only one ceiling is probed: the bench's capacity probe (A16, `npm run bench`) measures 188.7 chars/row on its wide payload and reports 212,011 rows. The other two are derived, never probed — `floor(40,000,000 ÷ chars-per-row)` arithmetic on a documented width: 176,468 rows at 226.7 chars/row (critique text one clause longer), and ≈195,000 rows at the ~205 chars/row a critique-bearing session is documented to cost. An over-limit paste is rejected with its true size named, never silently truncated. |
| **The main-thread fallback carries a bounded parse (A10).** On that path only, the parse loop re-reads the clock every 512 rows under the 800 ms sync budget and settles a `capacity` error *value* instead of freezing the thread. The worker path parses unbudgeted by design, under its tiered watchdog. |
| **Near the 1,000 ms cooperative budget the CI outcome is a distribution, not a constant.** At wide/200k the budget trips (CIs dropped 7/7 in the recorded run); at narrow/200k the median is 2.0% over the budget in the recorded run and has ranged 1.1%–8.0% over across the four runs on this box, where the CIs dropped in 6/7, 2/7, 0/7 and 0/7 of runs, because the deadline is sampled every 128 replicates. Point statistics, the grade, the deflation and the receipt settle identically in every case. |
| **Pixel baselines are skipped by policy.** The 2 skipped tests in `e2e/visual.spec.ts` are green-or-skipped per the bar: never red on stale goldens, and they need a human to regenerate the images. |
| **Absolute bench numbers move a few percent between runs.** The reference box is shared and virtualized (WSL2). The tier table, watchdog tiers, `B`, `alphaB` and every determinism guarantee are exact; the milliseconds are not. |
| **No browser-matrix CI.** Playwright runs Chromium only, on one worker. Firefox/WebKit browsers are installed locally but not exercised in CI. |
| **Some source doc-comments still read as planning notes** (for example the `_lib/report.ts` and `_lib/presets.ts` header comments refer to milestones and typed seams). They are comments, not behaviour, and were left untouched by this documentation pass because the brief scoped edits to the docs — but they are stale and should be corrected in a follow-up. |
