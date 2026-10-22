# Judgewright

> **Calibration instrument for the LLM judge you already ship.** Paste a set of
> verdicts as JSONL or CSV; Judgewright returns a report card with error bars — chance-corrected
> agreement, Krippendorff's α, seeded reproducible bootstrap CIs, ECE/Brier, a letter grade — all
> computed **in your browser**, with nothing sent anywhere.

Part of the **Nor AI Tier-0** suite of independent developer tools — a "Reference Target"
UI (light + dark), off-main-thread compute, zero server sync of user
payloads.

| | |
|---|---|
| **Slug** | `judgewright` |
| **Route** | `/tools/judgewright` (root `/` redirects there) |
| **Port** | **3005** (pinned in every file — never 3000) |
| **Canonical origin** | <https://judge.norai.tech> |
| **PM2 process** | `judge-norai` |
| **License** | MIT |
| **Version** | 1.0.0 (shipped feature set; `package.json` still reads `0.1.0` — see the [CHANGELOG](CHANGELOG.md#version-note)) |

---

## What it measures

Judgewright measures a judge you *already* have labels for. It never runs a judge, never ranks a
response, never scores an answer. Given a session of verdict rows — `example_id`,
`judge_label`, `human_label` and optionally scores, critiques, extra human raters, position and
length-preference flags — it reports:

**Agreement**

- **Confusion matrix** — rows are the human labels, columns are the judge labels, both sorted
  ascending (the receipt prints the order it used), with the heat tiers on the diagonal.
- **Binary metrics** — TPR (recall), TNR (specificity), precision/PPV, FPR and F1 against an
  echoed positive class. The positive class defaults to the second sorted label and is
  overridable from the toolbar; it is printed wherever it is used.
- **Multiclass metrics** — per-label precision, recall, F1 and support plus the macro averages.
  A zero denominator prints `—`, never `NaN`.

**Chance-corrected agreement (the headline)**

- **Cohen's κ, unweighted** — the headline coefficient, with the integer-rational fast path
  `κ = (A·n − S)/(n² − S)` so the canonical examples land on the nearest double bit-for-bit.
- **Weighted κ (linear and quadratic)** — `1 − D_o/D_e` secondary rows. They are never the
  headline, the grade, the deflation or the CI.
- **Δκ deflation** — `accuracy − κ_unweighted`, printed in percentage points beside the raw
  agreement, so the gap cannot be missed. A negative κ gets its own copy:
  *"κ is negative — the judge disagrees systematically."*
- **Chance baseline** — the always-majority dummy's agreement (`max_c` human label share) and
  the analytic `p_o = p_e` identity that makes its κ exactly `0`, so a κ near zero reads as
  "indistinguishable from always-pass".

**Krippendorff's α**

- **Panel α** over `[judge, human₁, …]` — the judge is a panel member — plus the **human
  ceiling** α over the human raters alone (needs ≥2 human raters per example; otherwise it says
  so instead of guessing).
- **Three levels**: `nominal` (δ = 1), `ordinal` (rank-distance δ) and `interval`
  (`δ = (v−v′)²`), each with its guard as a *value*: interval on non-numeric labels ⇒ `null`
  + reason; ordinal without numeric labels or an explicit `labelOrder` ⇒ nominal **with a
  warning**, never a silent alphabetical order.
- The mandate disclosure renders wherever α is shown: with one human rater the panel is two
  coders, so this is Krippendorff's α (a chance-corrected coefficient), not Cohen's κ — the two
  differ by construction.

**Uncertainty**

- **Seeded percentile bootstrap CIs** for accuracy, κ and α from **one index resample** per
  replicate (row indices drawn with replacement — never a relabelling): one `mulberry32`
  stream, one fused draw+accumulate pass, percentile endpoints by linear interpolation between
  closest ranks. `B` is a pure function of the row count (≤50k → 2,000 · ≤100k → 1,000 ·
  ≤150k → 500 · ≤200k → 500), so the same rows and the same seed reproduce **byte-identical**
  CIs in this process and in any other — see [BENCHMARKS.md](BENCHMARKS.md) for the
  cross-process digests.
- **α replicate budget** `min(B, 250)` above 50,000 rows, disclosed as
  `alphaReplicates` / `alphaBootstrapReplicates`.
- The cooperative deadline may **drop the CIs** (`ciDropped`, the copy names it). It can never
  change a point statistic, the reported `B` or the baseline.

**Calibration, bias and the per-example table**

- **ECE and Brier** over the `judge_score` column, with **two user-selected score semantics** —
  `P(positive)` (default; the score is P(reference is positive)) and `confidence` (the score is
  the judge's confidence in its own label). Never auto-detected: a likely mismatch raises the
  amber hint *"your scores look like confidences, not probabilities."* A duplicated
  `judge_score` column is reported **not computable** rather than computed from an arbitrary
  alias.
- **Position and verbosity bias** — `P(first slot) − 0.5` and `P(preferred answer was longer)
  − 0.5`, each computed only from columns that are actually present, naming the missing column
  otherwise.
- **Disagreement table** — one row per analyzed example with both labels, both critiques, the
  scores and the source line number, behind a disagreements-only filter. The pane shows a
  window of `MAX_TABLE_ROWS` (2,000) rows and prints *"showing X of Y"*; the exported totals
  are the **true** full-set counts.
- **Letter grade** — Landis–Koch bands on the **unweighted** κ, always disclosed as
  *"a convenience mapping, not a standard."* κ < 0 is `F` with its own label; no coefficient is
  a dash, never a fabricated letter.
- **Reproducibility receipt** — the exact formula and inputs for every figure, at 17 significant
  digits, naming the seed, the replicate count, the budgets, the engine and whether a deadline
  tripped.

**Exports** — a markdown report card, a one-line verdict (`κ = …, grade …, CI …`) and an
agreement JSONL, each copyable instantly (`⌘⇧C` too) plus a Download button. Export is never
gated behind sign-in; the offer appears only after the file already exists.

**No LLM calls.** The BYOK diagnosis panel was removed in the 2026-10 redesign (owner
decision). The engine `_services/llmDiagnosis.ts` and its tests stay in the repo as a dormant
seam, but no UI imports it and `https://openrouter.ai` is no longer in the CSP.

---

## Highlights

- **Judge a judge, not an answer.** Raw agreement counts the ties a coin flip would also have
  produced. The report prints raw agreement, the chance-corrected coefficient and the deflation
  between them side by side, so the gap cannot be missed.
- **Reproducibility is tested, not promised.** Same rows + same seed ⇒ byte-identical CIs
  in-process *and across processes* (`node --experimental-strip-types` entries, `npm run
  repro:seed` / `npm run repro:analyze`).
- **Off-main-thread pipeline.** Monotonic request ids with a stale-response guard, adaptive
  debounce tiers, a watchdog **tiered by payload size** (`watchdogMsFor`) so an in-cap 200k-row
  dispatch settles instead of being aborted at the small-paste wall, and one honest degradation
  path that runs the *same* pure core on the main thread.
- **One page that hosts everything.** Bezel header → `h1` + three promises → workstation
  (verdicts 36% | report 64%) → disagreements → beyond κ → share → comparison → method → FAQ →
  family footer.
- **"Reference Target" design system.** A charcoal bezel, ColorChecker state patches with one
  job each (agree, miss, caution, select), a six-step grey wedge for the agreement bands and a
  split-patch confusion matrix. Archivo + Fragment Mono. Documented in [DESIGN.md](DESIGN.md)
  with the sidecar `.impeccable/design.json`.
- **Instant copy everywhere.** Copy verdict (`⌘⇧C`) on the report plus Copy card / one-liner /
  JSONL in Share, with success and failure toasts.
- **100% client-side privacy.** Verdicts never leave the browser. No telemetry, no LLM call.

---

## Stack

- **Next.js 15** (App Router, `output: "standalone"`) · **React 19** · **TypeScript** strict
- **Tailwind CSS 3.4** + `tailwindcss-animate` — the Matchlight token ladder
- **zustand 5** with `persist` + `partialize` (content only)
- **next-themes 0.4** — per-tool `storageKey`, class-based dual theme
- **@supabase/supabase-js 2** — optional; a lazy dynamic import that is a `null` no-op when
  the env keys are absent
- Radix UI primitives + lucide-react icons; no CSS-in-JS, no animation runtime
- **tsx** (devDependency) — runs `npm run bench` against the real `_lib` modules

---

## Requirements

- **Node.js 22 LTS** — the version the Dockerfile and CI both pin (`.github/workflows/ci.yml`
  `node-version: 22`; `Dockerfile` `node:22-alpine`). The reference box that produced the
  measured numbers in [`BENCHMARKS.md`](BENCHMARKS.md) runs Node v24.13.0 and is equally green;
  Node 20 is newer than anything the project has ever been gated on and is not claimed.
- npm 10+

---

## Getting started

```bash
npm install
cp .env.example .env.local   # optional — the tool is fully functional without it
npm run dev
```

Open <http://localhost:3005/tools/judgewright>. The first run is seeded with a small,
hand-checkable demo session so the instrument is never blank; paste your own verdicts to
replace it.

### Verify

```bash
npm run typecheck    # tsc --noEmit          — strict, zero errors
npm run lint         # eslint .              — no-explicit-any + no-unused-vars as errors
npm test             # vitest node env       — 361 tests / 24 files
npm run build        # next build            — standalone artifact in .next/standalone
npm run test:e2e     # playwright            — 44 passed / 2 skipped, real standalone server
npm run bench        # tsx scripts/bench.ts  — measured parse/compute/bootstrap timings
npm run repro:seed   # node --experimental-strip-types — cross-process CI digest
npm run repro:analyze
```

CI mirrors the gate order exactly (`.github/workflows/ci.yml`): typecheck → lint → unit →
build → Playwright, with artifacts uploaded on failure.

---

## Scripts

| Script | What it does |
|---|---|
| `dev` | Next.js dev server on port `3005` |
| `build` | Production build (standalone output for PM2/Docker) |
| `start` | Serve the production standalone build on port `3005` (PM2 `judge-norai` in production) |
| `lint` | ESLint across the repo |
| `typecheck` | TypeScript strict check (`tsc --noEmit`) |
| `test` | Vitest unit tests (`**/__tests__/**/*.test.ts`, node env) |
| `test:watch` | Vitest in watch mode |
| `test:coverage` | Vitest with v8 coverage (scoped to `_lib`; thresholds enforced) |
| `test:e2e` | Playwright suite (Chromium; boots the real standalone artifact on 3005) |
| `test:e2e:ui` | Playwright interactive UI runner |
| `bench` | The reproducible pure-core benchmark (`scripts/bench.ts` via `tsx`) |
| `repro:seed` | Cross-process byte-reproducibility digest of the seeded CIs |
| `repro:analyze` | Cross-process digest of a full settled report |

**Port 3005 is pinned in every file that mentions it** — `package.json` (`dev` **and**
`start`), `playwright.config.ts` (`baseURL`, `webServer` URL and `PORT=`),
`Dockerfile` (`ENV PORT`, `EXPOSE`, `HEALTHCHECK`), `docker-compose.yml`
(`127.0.0.1:3005:3005`), `Caddyfile`, `ecosystem.config.cjs`, and this README. Keep them in
sync; port 3000 is reserved for the official website.

---

## Architecture

```
app/
├── layout.tsx                      # ThemeProvider · fonts · metadataBase · viewport
├── page.tsx                        # server redirect() → /tools/judgewright
├── globals.css                     # Matchlight token ladder (:root light · .dark dark)
├── icon.tsx · robots.ts · sitemap.ts
├── error.tsx · global-error.tsx · not-found.tsx
└── tools/judgewright/
    ├── page.tsx                    # composition: skip link → header → station → card → sections
    ├── _components/                # TopToolbar · CalibrationControls · RawEditorPane
    │                               # ReportPane · ReportInsights · ExportBar
    │                               # DiagnosisPanel · SiteHeader · StudioFooter
    │                               # CommandPalette · CompetitorMatrix · KnowledgeHub
    │                               # FaqSection · StatusLiveRegion · ThemeToggle
    │                               # auth/ (SignInButton, SignInModal) · providers/ThemeProvider
    ├── _hooks/
    │   ├── useToolWorker.ts        # worker lifecycle · debounce · tiered watchdog · degrade
    │   ├── useKeyboardShortcuts.ts # ⌘K ⌘P ⌘⇧C ⌘↵
    │   └── useAuth.ts              # env-gated no-op auth
    ├── _lib/                       # PURE core (statistics/parsing); no React, no DOM, no IO
    │                               # except the two browser-boundary exemptions authGate.ts +
    │                               # supabaseClient.ts, enumerated in purity.test.ts
    │   ├── types.ts                # shared types + worker protocol (zero runtime imports)
    │   ├── constants.ts            # every cap/budget/key, one import site
    │   ├── analyze.ts              # the ONE pipeline seam both engines call
    │   ├── parse.ts · csv.ts       # JSONL/CSV parse + column mapping + capacity
    │   ├── labels.ts               # label vocabulary normalization
    │   ├── confusionMatrix.ts      # matrix + binary + multiclass metrics
    │   ├── cohensKappa.ts          # unweighted headline + weighted secondary rows
    │   ├── krippendorffAlpha.ts    # nominal / ordinal / interval α with guards
    │   ├── chanceBaseline.ts       # always-majority baseline + the p_o = p_e identity
    │   ├── bootstrapCI.ts          # seeded index-resampling bootstrap + tier table
    │   ├── calibration.ts          # ECE + Brier (two score semantics)
    │   ├── biasMetrics.ts          # position / verbosity bias
    │   ├── grade.ts                # Landis–Koch bands on unweighted κ
    │   ├── disagreements.ts        # per-example rows + the display window
    │   ├── report.ts               # computeReport — the single source of semantics
    │   ├── reportRender.ts         # markdown · one-liner · JSONL · receipt
    │   ├── presets.ts · guide.ts · authGate.ts · supabaseClient.ts
    │   └── __tests__/              # 21 suites + 2 cross-process repro entries
    ├── _services/
    │   ├── llmDiagnosis.ts         # dormant BYOK seam; no UI imports it since the redesign
    │   └── __tests__/
    ├── _store/                     # useToolStore (persist content only) · useAuthPromptStore
    └── _workers/
        ├── compute.worker.ts       # imports ONLY _lib
        └── __tests__/
components/ui/                      # Tier-0 UI primitives (see docs/ui-kit.md)
lib/utils.ts · lib/site.ts          # clipboard helper · FAQ + site content
docs/ · e2e/ · DESIGN.md · .impeccable/design.json
```

Layer rules (BAR §4.7): `_components` may import `_lib` and `_store`, **never the reverse**;
`_workers` imports **only** `_lib`; `_lib` stays pure, which is what lets one core serve both
the worker and the main-thread fallback. The single documented exception is
`_services/llmDiagnosis.ts` — the one module that performs network IO, kept outside `_lib`
precisely so the pure core stays pure (AGENTS.md §25).

### Worker protocol

- Every message carries a monotonic `id`. A reply whose `id` is older than the current
  request is dropped by the stale-response guard **before** it can touch state.
- Adaptive debounce by input length: `≤5,000 → 0ms` · `>5,000 → 40ms` · `>20,000 → 120ms` ·
  `>200,000 → 250ms`.
- **Watchdog, tiered by payload size** (`watchdogMsFor`, `_lib/constants.ts`): `≤20,000 chars
  → 1,500 ms` · `≤200,000 → 3,000 ms` · `≤2,000,000 → 5,000 ms` · above → `8,000 ms`. On a
  trip the worker is terminated, the request id is bumped so any zombie reply is stale by
  definition, a fresh worker is respawned, and the store settles **atomically** — the error and
  the cleared previous numbers land in one `set()`, so a stale stat card never renders beside
  an error. The tiering exists because a flat 1.5 s wall aborts legitimate 200k-row
  dispatches.
- **Single degradation path:** `onerror`, `onmessageerror` and a spawn failure all funnel
  through `degradeToMainThread()` — terminate, flip `isWorkerAvailable`, amber banner — and run
  the *same* pure core synchronously under the stricter 800 ms budget with `degraded: true`.
  On that path only, the parse carries the same absolute budget (`parseDeadlineArmed`,
  checked every 512 rows), so a pathological paste settles a `capacity` error value instead of
  freezing the main thread. The worker path deliberately parses unbudgeted: it runs
  off-main-thread under its own tiered watchdog.
- **Announcements:** successes trail behind an 800 ms debounce so typing bursts collapse into
  one screen-reader update; errors settle immediately so a stale success never follows a
  rejection.

### Persistence

The zustand store persists exactly `{ verdictsText, rubric, settings }` to localStorage under
`judgewright-tool-storage` (v1), with `skipHydration: true` and an explicit rehydrate after
mount (so server HTML and first client paint never disagree). Report, metrics, worker state,
announcements and UI chrome are transient. The theme lives under `judgewright-theme` and is
**never** merged into the content store. The persisted slice is **bounded**
(`MAX_PERSISTED_TEXT_CHARS` = 1,000,000): a paste above that is not written at all — a reload
simply does not restore it, which is honest, instead of a `QuotaExceededError` escaping the
store's `set()` and unmounting the tree.

### Layout contract

The tool route is one centered single-page product: `<main>` spans the viewport
(`w-full overflow-x-hidden`, **no** `max-w-*` of its own) while every section inside it is
`mx-auto w-full max-w-7xl px-4 md:px-6 lg:px-8`. The workstation card holds the toolbar and
the two-pane grid (`lg:h-[620px] lg:grid-cols-2`, stacking below `lg`); the command palette
(`⌘K`) and the sign-in modal mount globally alongside the page. The e2e suite asserts the
responsive contract — no horizontal overflow at 390 and 1440, single-column stacking below
`lg`, exactly one `<h1>`, `header/main/footer` landmarks — rather than any pixel width.

---

## Keyboard shortcuts

| Chord | Action |
|---|---|
| `⌘K` / `⌃K` | Toggle the command palette |
| `⌘P` / `⌃P` | Toggle the inline samples menu |
| `⌘⇧C` / `⌃⇧C` | Copy the current output (lime success · rose failure toast) |
| `⌘↵` / `⌃↵` | Focus the primary input (verdicts), rAF-deferred |

---

## Privacy & security

- **Zero egress on the default path is a test, not a marketing line.**
  `e2e/visual.spec.ts` installs a request listener before navigation and fails CI if *any*
  non-localhost request is made during first paint **and** a full compute through the worker.
  `smoke.spec.ts` additionally asserts there is no diagnosis surface and no openrouter request.
- **CSP** (`next.config.ts`, built from `DECLARED_ORIGINS` in `_lib/constants.ts`):
  `default-src 'self'` · `script-src 'self' 'unsafe-inline'` (+ `'unsafe-eval'` **dev only**)
  · `style-src 'self' 'unsafe-inline'` · `img-src 'self' data: blob:` · `font-src 'self' data:`
  · `connect-src 'self' https://*.supabase.co
  wss://*.supabase.co` · `worker-src 'self' blob:` ·
  `frame-ancestors 'none'` · `base-uri 'self'` · `form-action 'self'` · `object-src 'none'`.
  The only non-`'self'` origins are the optional OAuth flow, which is a no-op until the env
  keys are set and you choose to sign in. A static unit test
  (`_lib/__tests__/csp.test.ts`) asserts the shipped header never allows an origin outside
  that documented list.
- **Other headers:** HSTS `max-age=63072000; includeSubDomains; preload`, `nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` with camera /
  microphone / geolocation disabled, `X-DNS-Prefetch-Control: on`, and
  `poweredByHeader: false`. `img-src` carries no third-party host at all — the OAuth-avatar
  origins were removed so an unused allow-list entry cannot become an egress path with no
  owner, and a static test asserts it never drifts back.
- **Fonts are fetched at build time.** `next/font/google` (Inter + JetBrains Mono) self-hosts
  them at build time and serves them from the app origin, so **no font origin appears at
  runtime** — `font-src` stays `'self' data:`.
- **Auth is env-gated.** With the Supabase keys absent the client is a `null` no-op: no
  bootstrap, no listeners, zero backend connections, and the tool is fully usable. Sign-in is
  an offer (a return visit, and after an export), never a wall; core work and export stay
  100% free.

---

## Deployment

The production truth is **PM2 + nginx + certbot** (`context.md` §5); Docker + Caddy ship as
the parallel ops artifacts. Both are first class — do not delete one for the other.
The exact, human-gated runbook is [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

**PM2 (documented production path)**

```bash
npm ci && npm run build
pm2 start ecosystem.config.cjs   # process name: judge-norai, port 3005, 127.0.0.1
pm2 save
# nginx proxies judge.norai.tech → 127.0.0.1:3005; certbot issues the certificate
```

**Docker / Caddy (parallel path)**

```bash
docker compose build --pull && docker compose up -d --remove-orphans
# Caddyfile: judge.norai.tech → reverse_proxy judge-norai:3005 (auto-TLS)
./deploy.sh confirm            # SHA-gated: refuses without DEPLOY_CONFIRM=1
```

`.env.example` is the authoritative environment source: a single
`NEXT_PUBLIC_SITE_URL=https://judge.norai.tech`, plus Supabase keys that are **empty by
default** so the tool is zero-backend out of the box.

---

## Testing

- **Unit (vitest, node env, **361 tests / 24 files**, ~2 s):**
  `_lib/__tests__/` — `parse.test.ts` (52: the six parse error classes, BOM, CSV quoting,
  ambiguity), `analyze.test.ts` (22), `confusion.test.ts` (12), `cohensKappa.test.ts` (21:
  reference values + the weighted rows), `krippendorffAlpha.test.ts` (17: the published
  worked example + the guards), `chanceBaseline.test.ts` (15), `bootstrap.test.ts` (19:
  determinism, the tier table, the cooperative deadline, the cross-process spawn),
  `calibration.test.ts` (17: ECE/Brier + both score semantics), `biasMetrics.test.ts` (5),
  `grade.test.ts` (5), `disagreements.test.ts` (8), `labels.test.ts` (18), `report.test.ts`
  (23), `reportRender.test.ts` (32), `presets.test.ts` (6), `authGate.test.ts` (10),
  `supabaseClient.test.ts` (6), `content.test.ts` (5: education prose carries no uncited
  number), `csp.test.ts` (10: the static half of the zero-egress proof), `purity.test.ts`
  (6: no transcendentals, no IO, one definition per constant), `milestones.test.ts` (13:
  the report-level proofs — the adjacent-error grade, the κ-vs-α disclosure, the tier copy);
  `_workers/__tests__/compute.worker.test.ts` (7: the LRU + the fingerprint identity guard);
  `_services/__tests__/llmDiagnosis.test.ts` (19: payload caps, the disclosed request, the
  one-call contract);
  `_hooks/__tests__/useJudgewrightWorker.test.ts` (13: debounce tiers, the tiered watchdog,
  the degrade path).
- **E2E (Playwright, real standalone artifact, 44 passed / 2 skipped):**
  `smoke.spec.ts` (shell journeys + the D2 report card + no diagnosis surface),
  `demos.spec.ts` (live-compute demos, the degraded path with identical numbers, the quota
  guard, the atomic abort settle), `copy.spec.ts` (the copy path, both toast variants),
  `disagreements.spec.ts` (the window never masquerading as the total),
  `perf.spec.ts` (a 200k-row dispatch settles a report; exported totals are the true counts),
  `visual.spec.ts` (the layout contract, FAQ JSON-LD zero-drift, and the
  zero-external-request guard).

The 2 skips are the documented pixel baselines in `visual.spec.ts`: per the green-or-skipped
rule they stay skipped until a human regenerates the goldens, and are never left red on stale
images.

---

## Bundle budget

First Load JS for `/tools/judgewright` is **198 kB** against the 200 kB ceiling
(`npm run build`: route `94.8 kB`, shared `103 kB`). Two things keep it there. The tool spends
**no animation runtime** — toasts and menus use the design system's own CSS transitions,
capped at 300 ms. And no network module ships in the page at all. See [Limitations](#limitations) for the headroom this leaves.

---

## Limitations (the honest list)

- **First Load JS is 198 kB of the 200 kB budget — about 2 kB of headroom.** Any new
  first-paint dependency needs to displace something or be code-split.
- **The row ceiling is a property of the two caps multiplying.** `MAX_ROWS` is 200,000 and
  `MAX_INPUT_CHARS` is 40,000,000, so the binding limit for a critique-bearing session is
  `min(200,000, 40,000,000 ÷ chars-per-row)`. A critique-bearing row is ~200 characters, which
  puts the real ceiling at roughly **190,000 rows** — a paste past that is rejected by the
  character limit with its true size named, never silently truncated. (`scripts/bench.ts`
  measures the ceiling for its own payload and dispatches the largest in-cap size for real;
  see [BENCHMARKS.md](BENCHMARKS.md).)
- **No selector UI for the α level or the ECE binning yet.** `ComputeOptions` already carries
  `alphaLevel` (`nominal` / `ordinal` / `interval`, plus `labelOrder`) and `bins` / `binMode`,
  and the engine implements all of them — but nothing in the UI sets them today, so the engine
  defaults to **nominal α** and **equal-width, 10-bin ECE**. The report card *discloses* which
  level and which binning it used rather than letting a reader assume. The `judge_score`
  semantics selector (`P(positive)` / `confidence`) and the positive-class selector **are**
  wired, because they change the meaning of a number already on screen.
- **The main-thread fallback carries a bounded parse** (AGENTS A10): on that path only, the
  parse loop re-reads the wall clock every 512 rows under the 800 ms sync budget and settles a
  `capacity` parse error value rather than holding the thread. The worker path parses
  unbudgeted by design, under its tiered watchdog.
- **Nothing is sent anywhere on the default path, per visit.** The only outbound request the
  product can make is Supabase OAuth, when the env keys are configured and you sign in. There is no telemetry, no shadow endpoint and no
  "anonymized" payload upload.
- **The letter grade is a convention.** Landis–Koch bands over unweighted κ are printed with
  that disclosure everywhere a grade appears.

---

## License

MIT — see [LICENSE](LICENSE).
