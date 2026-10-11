# Judgewright

> **Calibration instrument for the LLM judge you already ship.** Paste a rubric and a set of
> verdicts; Judgewright returns a report card with error bars — chance-corrected agreement,
> Krippendorff's α, seeded reproducible bootstrap CIs, and a letter grade. 100% in-browser.

Part of the **Nor AI Tier-0** suite of independent developer workstations — machined
Linear/Raycast-class UI (light + dark), off-main-thread compute, zero server sync of user
payloads.

> **Status of this repository — read this first.** This is the **scaffold milestone**: a
> runnable, dual-theme, fully packaged application shell with the *worker pipeline already
> wired end to end* (paste → Web Worker → render → instant copy). The deterministic
> statistics core lands in the next milestone behind the seams described in
> [`docs/blueprint.md`](docs/blueprint.md) §7. Everything the shell promises about
> architecture, layout, privacy, packaging and gates is true **today**; only the arithmetic
> is deferred, and the report pane says so explicitly rather than showing a fabricated
> number.

| | |
|---|---|
| **Slug** | `judgewright` |
| **Route** | `/tools/judgewright` (root `/` redirects there) |
| **Port** | **3005** (pinned in every file — never 3000) |
| **Canonical origin** | <https://judge.norai.tech> |
| **PM2 process** | `judge-norai` |
| **License** | MIT |

---

## Highlights

- **Judge a judge, not an answer.** Judgewright measures a judge you *already* have labels
  for. It never runs a judge, never ranks a response, never scores an answer.
- **Chance-corrected headline.** Raw agreement counts the ties a coin flip would also have
  produced. The report prints raw agreement, the chance-corrected coefficient and the
  deflation between them, side by side, so the gap cannot be missed.
- **Reproducibility receipt.** Deterministic statistics: same rows, same seed, same replicate
  count ⇒ byte-identical output. Every figure names its seed, its replicate count, its budget
  and the engine that produced it.
- **Off-main-thread pipeline.** Monotonic request ids with a stale-response guard, adaptive
  debounce tiers, a 1.5s watchdog that terminates and respawns, and one honest degradation
  path that runs the *same* pure core on the main thread.
- **One page that hosts everything.** Sticky header → station `h1` + trust pills → one
  workstation card → comparison → guide → FAQ → footer, centered at `max-w-7xl`.
- **Matchlight design system.** Green-tinted neutral surface ladder, 1px hairline machine
  rules, one reserved accent (brand-lime) worn only by measurement and control state; mono
  reserved for machine data. Documented in [`docs/DESIGN.md`](docs/DESIGN.md).
- **Instant copy everywhere.** Per-pane copy buttons plus `⌘⇧C`, with a brand-lime success
  toast and a rose failure toast.
- **100% client-side privacy.** Verdicts never leave the browser. No telemetry on payload
  content. The auto-diagnosis flow is **off by default** and only ever armed by a key *you*
  paste.

---

## Stack

- **Next.js 15** (App Router, `output: "standalone"`) · **React 19** · **TypeScript** strict
- **Tailwind CSS 3.4** + `tailwindcss-animate` — the Matchlight token ladder
- **zustand 5** with `persist` + `partialize` (content only)
- **next-themes 0.4** — per-tool `storageKey`, class-based dual theme
- **@supabase/supabase-js 2** — optional; a lazy dynamic import that is a `null` no-op when
  the env keys are absent
- Radix UI primitives + lucide-react icons; no CSS-in-JS, no animation runtime

---

## Requirements

- **Node.js >= 20** (22 recommended; the reference box runs 24.13)
- npm 10+

---

## Getting started

```bash
npm install
cp .env.example .env.local   # optional — the tool is fully functional without it
npm run dev
```

Open <http://localhost:3005/tools/judgewright>.

### Verify

```bash
npm run typecheck   # tsc --noEmit          — strict, zero errors
npm run lint        # eslint .              — no-explicit-any + no-unused-vars as errors
npm test            # vitest node env       — pure-core suites
npm run build       # next build            — standalone artifact in .next/standalone
npm run test:e2e    # playwright            — boots the REAL standalone server on 3005
```

CI mirrors this order exactly (`.github/workflows/ci.yml`): typecheck → lint → unit → build →
Playwright, with artifacts uploaded on failure.

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
| `test:e2e` | Playwright suite (Chromium; auto-builds and boots the standalone artifact) |
| `test:e2e:ui` | Playwright interactive UI runner |

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
    ├── _components/                # TopToolbar · RawEditorPane · ReportPane · SiteHeader
    │                               # StudioFooter · CommandPalette · CompetitorMatrix
    │                               # KnowledgeHub · FaqSection · StatusLiveRegion · ThemeToggle
    │                               # auth/ (SignInButton, SignInModal) · providers/ThemeProvider
    ├── _hooks/
    │   ├── useToolWorker.ts        # worker lifecycle · debounce · watchdog · degrade
    │   ├── useKeyboardShortcuts.ts # ⌘K ⌘P ⌘⇧C ⌘↵
    │   └── useAuth.ts              # env-gated no-op auth
    ├── _lib/                       # PURE: no React, no DOM, no IO
    │   ├── types.ts                # shared types + worker protocol (zero runtime imports)
    │   ├── constants.ts            # every cap/budget/key, one import site
    │   ├── analyze.ts              # placeholder compute core (the statistics seam)
    │   ├── presets.ts · guide.ts · authGate.ts · supabaseClient.ts
    │   └── __tests__/              # analyze · authGate · presets · content · csp
    ├── _store/                     # useToolStore (persist content only) · useAuthPromptStore
    └── _workers/compute.worker.ts  # imports ONLY _lib
components/ui/                      # Tier-0 UI primitives (see docs/ui-kit.md)
lib/utils.ts · lib/site.ts
docs/ · e2e/ · design_tokens.json
```

Layer rules (BAR §4.7): `_components` may import `_lib` and `_store`, **never the reverse**;
`_workers` imports **only** `_lib`; `_lib` stays pure, which is what lets one core serve both
the worker and the main-thread fallback.

### Worker protocol

- Every message carries a monotonic `id`. A reply whose `id` is older than the current
  request is dropped by the stale-response guard **before** it can touch state.
- Adaptive debounce by input length: `≤5,000 → 0ms` · `>5,000 → 40ms` · `>20,000 → 120ms` ·
  `>200,000 → 250ms`.
- **Watchdog (1,500 ms):** on dispatch a timer is armed; if it fires, the worker is
  terminated, the request id is bumped so any zombie reply is stale by definition, a fresh
  worker is respawned, and a friendly error settles.
- **Single degradation path:** `onerror`, `onmessageerror` and a spawn failure all funnel
  through `degradeToMainThread()` — terminate, flip `isWorkerAvailable`, amber banner, and
  settle the *same* pure core synchronously under the stricter 800 ms budget with
  `degraded: true`. The UI never pretends the fallback is async.
- **Announcements:** successes trail behind an 800 ms debounce so typing bursts collapse into
  one screen-reader update; errors settle immediately so a stale success never follows a
  rejection.

### Persistence

The zustand store persists exactly `{ verdictsText, rubric, settings }` to localStorage under
`judgewright-tool-storage` (v1), with `skipHydration: true` and an explicit rehydrate after
mount (so server HTML and first client paint never disagree). Report, metrics, worker state,
announcements and UI chrome are transient. The theme lives under `judgewright-theme` and is
**never** merged into the content store.

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
  The auto-diagnosis flow is off by default and is never armed automatically.
- **CSP** (`next.config.ts`, built from `DECLARED_ORIGINS` in `_lib/constants.ts`):
  `default-src 'self'` · `script-src 'self' 'unsafe-inline'` (+ `'unsafe-eval'` **dev only**)
  · `style-src 'self' 'unsafe-inline'` · `connect-src 'self' https://*.supabase.co
  wss://*.supabase.co https://openrouter.ai` · `worker-src 'self' blob:` ·
  `frame-ancestors 'none'` · `base-uri 'self'` · `form-action 'self'` · `object-src 'none'`.
  The only non-`'self'` origins are the optional OAuth flow and the single opt-in BYOK
  diagnosis call — both user-initiated, and both no-ops until you act. A static unit test
  (`_lib/__tests__/csp.test.ts`) asserts the shipped header never allows an origin outside
  that documented list.
- **Other headers:** HSTS `max-age=63072000; includeSubDomains; preload`, `nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` with camera /
  microphone / geolocation disabled, `poweredByHeader: false`.
- **Fonts** are fetched at build time by `next/font/google` and served from the app origin —
  the README caveat the bar requires: no font origin appears at runtime.
- **Auth is env-gated.** With the Supabase keys absent the client is a `null` no-op: no
  bootstrap, no listeners, zero backend connections, and the tool is fully usable.

---

## Deployment

The production truth is **PM2 + nginx + certbot** (`context.md` §5); Docker + Caddy ship as
the parallel ops artifacts. Both are first class — do not delete one for the other.

**PM2 (documented production path)**

```bash
npm ci && npm run build
pm2 start ecosystem.config.cjs   # process name: judge-norai, port 3005, 127.0.0.1
pm2 save && pm2 startup
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

- **Unit (vitest, node env):** `_lib/__tests__/analyze.test.ts` (the placeholder core: byte /
  word / line counting, echo capping, the capacity error as a value, determinism, the seeded
  fixture), `authGate.test.ts` (offer-never-lock policy, degraded-`localStorage` and
  no-`window` paths), `presets.test.ts` (the seeded first run is never blank),
  `content.test.ts` (education prose carries no uncited number), `csp.test.ts` (static
  half of the zero-egress proof).
- **E2E (Playwright, real standalone artifact):** `smoke.spec.ts` (redirect, landmarks, trust
  pills, the worker round trip with independently recomputed counts, persistence scoping,
  `⌘K` palette, `⌘P` samples menu), `demos.spec.ts` (large-payload debounce tier, theme
  flip, `⌘⇧C` copy with the lime toast and clipboard read-back, copy failure → rose toast,
  the degraded amber banner with identical numbers, clear), `visual.spec.ts` (layout
  contract, single-column stacking, FAQ JSON-LD zero-drift, and the zero-external-request
  guard).

---

## Caveats & FAQ

- **No statistics yet.** The report card is an explicit placeholder
  ("compute enabled in next milestone"). Nothing is fabricated in the meantime — see
  `QUALITY_REPORT.md` for the honest gap list.
- **The optional LLM diagnosis is not implemented**: no key exists anywhere in the app, the
  `connect-src` allow-list already reserves the single origin it would use, and the toolbar
  states that auto-diagnosis is off.
- **`_lib/` contains no transcendentals** by rule (`Math.log/pow/exp/sqrt/sin/cos/atan` are
  absent), so every number the statistics milestone ships will be `+ − × ÷` of doubles.
- **Coverage thresholds** (`functions ≥ 90`, `lines/statements ≥ 80`, `branches ≥ 70`,
  scoped to the pure core) are configured in `vitest.config.mts` and gated in CI once the
  statistics core lands — they are meaningless for a placeholder.

---

## License

MIT — see [LICENSE](LICENSE).
