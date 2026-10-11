# Judgewright — Quality Report

Honest gate record for the **scaffold milestone**. Nothing here is aspirational; where a bar
item is not satisfied, it is listed under *Gaps* with the reason and the milestone that closes
it.

Run at the time of writing: Node v24.13.0, npm 11.8.0, Linux (WSL2). Commands are run from the
repository root.

## Gate record

| # | Command | Exit | Evidence |
|---|---|---|---|
| 1 | `npm install --no-audit --no-fund` | **0** | `added 456 packages` (npm registry reachable, 458ms ping) |
| 2 | `npm run typecheck` (`tsc --noEmit`) | **0** | no output = zero errors under `strict` |
| 3 | `npm run lint` (`eslint .`) | **0** | no output = zero errors/warnings (`no-explicit-any` + `no-unused-vars` are `error`, not `warn`) |
| 4 | `npm test` (vitest, node env) | **0** | **6 files, 53 tests passed** |
| 5 | `npm run build` (`next build`) | **0** | 8 routes, all static; `/tools/judgewright` = **112 kB route / 177 kB First Load JS** |
| 6 | `npm run test:e2e` (Playwright, standalone artifact) | **0** | **25 passed, 2 skipped (documented pixel baselines)**, verified twice in a row |

Verbatim excerpts:

```
$ npm test
 Test Files  6 passed (6)
      Tests  53 passed (53)

$ npm run build
Route (app)                                 Size  First Load JS
┌ ○ /                                      135 B         103 kB
└ ○ /tools/judgewright                    112 kB         178 kB  →  177 kB after config change
+ First Load JS shared by all             103 kB

$ npm run test:e2e
Running 27 tests using 1 worker
  ...
  2 skipped
  25 passed (2.6m)
```

Run twice back to back on the same artifact: both runs green, and no `node server.js` process
is left behind (the `exec` wrapper in `scripts/serve-standalone.sh` means the server Playwright
spawns IS the server, so it is killed cleanly).

## The 18-item checklist (BAR §1), as it applies to this scaffold

| Item | Status | Evidence |
|---|---|---|
| 1. One accent (`brand-lime`) | **pass** | `brand-lime` only in settled measurement, primary action, focus ring, plane separation; grep over `components/ui` + `_components` shows no second hue on interactive elements |
| 2. Semantic state colors only | **pass** | amber = degraded banner; rose = rejection + failure toast; no third usage |
| 3. No design adjectives as color names | **pass** | tokens only; hex literals live in `:root`/`.dark` and `icon.tsx` |
| 4. Tokens from `globals.css` / `design_tokens.json` | **pass** | JSON mirror validates; every token in the ladder is documented |
| 5. Mono reserved for machine data | **pass** | `font-mono` only on verdicts, code, stats, chords, badges, captions |
| 6. Type hierarchy without color | **pass** | size/weight/tracking only |
| 7. Chart/library/brand text scales obey the tokens | **pass (partial)** | no charts in the scaffold; brand text uses the sans scale |
| 8. `rounded-2xl` cap | **pass** | workstation card is the only `rounded-2xl` surface |
| 9. Only `shadow-raycast` / `shadow-elevated` | **pass** | grep confirms both only |
| 10. No glow / colored shadow / blur effects | **pass** | header `backdrop-blur-[6px]` only, per the brief |
| 11. Five interaction states per control | **pass** | primitives + panes + toolbar + palette |
| 12. Required keyboard set | **pass** | ⌘K ⌘P ⌘⇧C ⌘↵ all implemented and e2e-covered |
| 13. `hover` always paired with `focus-visible` | **pass** | enforced by review of every primitive |
| 14. Copy feedback present | **pass** | lime/rose toasts, e2e reads the clipboard back |
| 15. Every workflow state reachable | **pass** | idle · processing · error · degraded · ready all reachable; degraded proven in e2e |
| 16. Reduced-motion kill-switch | **pass** | global in `globals.css`; every spinner/transition is gated |
| 17. Landing route = homepage redirect | **pass** | `app/page.tsx` server `redirect()`; e2e asserts the final URL |
| 18. Zero-job-Home icons | **pass** | lucide icons |

### Additional bar items (BAR §4/§5)

- **Worker contract** — monotonic ids + stale guard, debounce 0/40/120/250, 1,500ms watchdog
  with terminate + respawn, one degradation path running the same core: implemented in
  `_hooks/useToolWorker.ts`; e2e proves the degraded path renders the amber banner **and**
  settles identical numbers.
- **Errors are values** — `AnalysisOutcome` is a discriminated union; no throw path except the
  worker's last-resort envelope.
- **Pure core, no transcendentals** — `grep -n "Math\.\(log\|pow\|exp\|sqrt\|sin\|cos\|atan\)"
  app/tools/judgewright/_lib` returns nothing.
- **CSP** — `default-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`,
  `object-src 'none'`, `form-action 'self'`, `script-src` unsafe-eval **dev only**,
  `connect-src` exactly `DECLARED_ORIGINS`. Static test: `_lib/__tests__/csp.test.ts`.
- **Zero egress** — `e2e/visual.spec.ts` fails on any non-localhost request during first paint
  and a full compute. **Passing.**
- **Coverage** — `npx vitest run --coverage` reports statements 98.82% · branches 97.36% ·
  functions 100% · lines 98.75% against the bar's 80/70/90/80. `npm test` does not gate on
  coverage (the thresholds are configured and would pass today, but a placeholder core would
  make the gate look like real proof).

## Standalone runtime proof

```bash
$ rm -rf .next/standalone/public .next/standalone/.next/static && \
  cp -r public .next/standalone/public && cp -r .next/static .next/standalone/.next/static && \
  PORT=3005 HOSTNAME=127.0.0.1 node .next/standalone/server.js &
$ curl -sS -o /dev/null -w "%{http_code} -> %{redirect_url}" http://127.0.0.1:3005/
307 -> http://127.0.0.1:3005/tools/judgewright
$ curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3005/tools/judgewright
200
```

The 307 is the root redirect; `/robots.txt` and `/sitemap.xml` serve the canonical
`https://judge.norai.tech` origin.

## Worker round-trip proof (e2e)

`e2e/smoke.spec.ts` › *"worker round trip: a paste settles matching character, word, byte and line counts"*:

1. fills a known payload into `#tool-verdicts-input`;
2. waits for `[data-report-state="ready"]` and asserts `[data-engine="worker"]` — the badge
   that is only rendered when the result came back from `compute.worker.ts`;
3. recomputes characters / words / lines in the test and bytes via
   `new TextEncoder().encode(payload).length` **inside the page**, then asserts the pane shows
   exactly those numbers.

`e2e/demos.spec.ts` adds the 6,000-character payload (which takes the 40ms debounce tier) and
the degraded-path journey where a `Worker` constructor that throws forces the main-thread
fallback: the amber banner renders and the same payload produces the same counts.

## Gaps (deliberate, all milestone-scoped)

| Gap | Why it is not a defect today |
|---|---|
| No statistics (no parse, κ, α, bootstrap, grade) | Explicitly a placeholder card that says "compute enabled in next milestone"; the SPEC/PLAN assign it to M1/M2. Nothing is fabricated instead. |
| No LLM diagnosis panel | No key exists in the app and `AUTO_DIAGNOSIS_ENABLED` is `false`; the origin is already CSP-reserved and the zero-egress guard passes. |
| No export bundle, disagreement table, virtualized window | M3/M5. |
| No cited third-party numbers | The education prose is digit-free by construction (`content.test.ts` guards it), so the AC-56 citation rule cannot be violated; the citations ship with the content milestone. |
| No pixel baselines | Deliberately skipped, per BAR §6.4 (green-or-skipped, never red on stale goldens). |

## Bundle budget

First Load JS for `/tools/judgewright` is **177 kB** against the 200 kB ceiling. The scaffold
spends no animation runtime — toasts and menus follow the design system's own CSS transitions —
which is what keeps the budget intact while shipping a command palette, two Radix menus and a
worker pipeline.
