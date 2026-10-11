# Changelog

All notable changes to Judgewright. Format: keep-a-changelog, semantic versioning.

## [Unreleased]

### Added — scaffold milestone

- **Application shell** at `/tools/judgewright` (root `/` redirects): skip link, SiteHeader,
  station header with a single `<h1>`, tagline and trust pills, one workstation card
  (`TopToolbar | RawEditorPane | ReportPane | status strip`), CompetitorMatrix, KnowledgeHub,
  FaqSection with `FAQPage` JSON-LD derived from the same array, StudioFooter.
- **Worker pipeline** — `_workers/compute.worker.ts` (monotonic ids, stale-response guard,
  artifact LRU) and `_hooks/useToolWorker.ts` (adaptive debounce 0/40/120/250ms, 1,500ms
  watchdog with terminate + respawn, single `degradeToMainThread` fallback running the same
  pure core under the stricter 800ms budget, 800ms announce debounce).
- **Pure core seam** — `_lib/analyze.ts` placeholder measurement (characters/words/bytes/lines
  + echo), `_lib/constants.ts` as the single cap/budget import site, `_lib/types.ts` with the
  worker protocol and the statistics seam types.
- **State** — `_store/useToolStore.ts` persisting exactly `{ verdictsText, rubric, settings }`
  under `judgewright-tool-storage` with `skipHydration` + explicit rehydrate, atomic
  `applyComputation`, and a `degraded` flag surfaced as an amber banner.
- **Interaction** — ⌘K command palette (grouped navigation / samples / actions rows),
  ⌘P inline samples menu, ⌘⇧C instant copy with lime success / rose failure toasts,
  ⌘↵ focus-primary-input, StatusLiveRegion, Toaster mounted globally.
- **Dual theme** — Matchlight ladder from `app/globals.css` + `design_tokens.json`,
  `next-themes` with the per-tool storage key.
- **Packaging & gates** — `output: "standalone"`, CSP + HSTS + nosniff + Referrer-Policy +
  Permissions-Policy, PM2 `judge-norai` on 127.0.0.1:3005, Docker (3-stage, port 3005) +
  Caddy + SHA-gated `deploy.sh`, CI running typecheck → lint → unit → build → Playwright.
- **Docs** — README, AGENTS (binding axioms), DESIGN, surface brief, blueprint, PRODUCT,
  ui-kit, tutorial, quality report, benchmarks, release checklist.

### Verified

- `npm run typecheck`, `npm run lint`, `npm test` (53/53), `npm run build` (First Load JS
  177kB, under the 200kB budget), `npm run test:e2e` (25 passed / 2 documented-skips of 27,
  including the zero-external-request guard) — see `QUALITY_REPORT.md` for the exact commands
  and outputs, and `BENCHMARKS.md` for the two flake fixes the repeat runs surfaced.

### Known gaps (deferred to the statistics milestone)

- Deterministic statistics: no parse, no confusion matrix, no κ / α, no bootstrap CIs, no grade.
- No disagreement table, export bundle, or LLM diagnosis panel (no API key exists in the app).
