# Changelog

All notable changes to Judgewright. Format: keep-a-changelog, semantic versioning.

## [Unreleased]

### Added — statistics milestone (D2)

- **Krippendorff's α** (`_lib/krippendorffAlpha.ts`) — nominal, ordinal (`Σ_g` rank-distance)
  and interval (`δ = (v−v′)²`) over a coincidence-matrix panel, computed for the panel
  (judge as a member) and the human ceiling. Guards as values: `interval` on non-numeric
  labels ⇒ null + `"interval α needs numeric labels; use nominal"`; `ordinal` without numeric
  labels or an explicit `labelOrder` ⇒ nominal + warning (never a silent sort order); binary
  nominal ≡ ordinal bit-for-bit. Pinned references: 3-coder × 15-unit example
  nominal `1 − 75/243 = 0.691358024691358`, interval `1 − 12/63.44 = 0.8108448928121059`.
  The mandate disclosure (`with one human rater the panel is 2 coders … the two differ by
  construction`) renders in the pane, the markdown and the receipt.
- **Weighted κ** as `1 − D_o/D_e` (`_lib/cohensKappa.ts`) — linear and quadratic secondary
  rows with the same single degenerate guard; the headline, the grade, the Δκ deflation and
  every CI stay on the unweighted coefficient. `kappaFromPairCounts` is the same coefficient
  from an integer class-pair matrix, so a bootstrap replicate never rebuilds a label.
- **Seeded percentile bootstrap** (`_lib/bootstrapCI.ts`) — index resampling only (row indices
  with replacement; a replicate re-derives marginals from its own rows), one `mulberry32`
  stream, one fused draw+accumulate pass, `B` a pure function of the row count
  (≤50k→2,000 · ≤100k→1,000 · ≤150k→500 · ≤200k→500), `α` budget `min(B, 250)` above 50k rows.
  `_lib/__tests__/repro.entry.ts` (`node --experimental-strip-types`) proves byte-identical
  CIs ACROSS processes (AC-13); the cooperative deadline may drop CIs (`ciDropped`, the
  reason named) but never changes a point statistic or `B`.
- **Letter grade** (`_lib/grade.ts`) — Landis–Koch bands on the UNWEIGHTED κ, disclosed as a
  convenience mapping; κ < 0 ⇒ `F` + "worse than chance" and the headline copy
  `"κ is negative — the judge disagrees systematically"`.
- **Disagreement table** (`_lib/disagreements.ts`) — the full per-example rows (human vs judge
  + both critiques + line numbers) in the pure core; the worker payload ships the summary plus
  a window of `MAX_TABLE_ROWS` rows with the honest `totalCount`, and the pane prints
  "showing X of Y". The ≤25 diagnosis rows rank by confusion-cell frequency and round-robin
  across distinct cells.
- **Report card** (`_components/ReportPane.tsx`) — headline with CIs, Δκ deflation, letter
  grade + convention note, confusion matrix, α panel (panel + ceiling + disclosure + warning),
  weighted-κ secondary rows, bootstrap tier copy, windowed disagreement table with a
  disagreements-only filter, and the extended reproducibility receipt.

### Changed — statistics milestone (D2)

- `computeReport` fills α (panel + humans + warning), the weighted κ rows, the seeded CIs, the
  grade, the Δκ headline, the per-example rows and the receipt; Phase A stays cheap and always
  runs, Phase B is deadline-gated.
- The worker posts (and caches) the summary + display window instead of the full row set, and
  the store carries `disagreementWindow` for both paths.
- `tsconfig.json` gains `allowImportingTsExtensions` because the AC-13 repro entry is run by
  `node --experimental-strip-types`, which resolves only fully-specified specifiers; the
  statistics core names its runtime dependencies with explicit `.ts` extensions accordingly.

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
