# AGENTS.md — Judgewright

> Binding axioms for every AI agent that touches this repo. Each is stated so a reviewer can
> verify it mechanically. If a change conflicts with one of these, the change is wrong.

## 0. Identity (context.md §4.2)

1. **Slug** `judgewright` · route `/tools/judgewright` · port **3005** · origin
   <https://judge.norai.tech> · PM2 `judge-norai` · MIT license · deploy user `deploy@`.
2. Port 3005 is pinned in **every** file that names a port — `package.json` (`dev` *and*
   `start`), `playwright.config.ts` (`baseURL`, `webServer.url`, `PORT=`), `Dockerfile`
   (`ENV PORT`, `EXPOSE`, `HEALTHCHECK`), `docker-compose.yml` (`127.0.0.1:3005:3005`),
   `Caddyfile`, `ecosystem.config.cjs`, `README.md`. **Port 3000 is reserved for the official
   website — never use it here.** If you rename one, rename all.
3. `NEXT_PUBLIC_SITE_URL` is the ONLY source for `metadataBase` (`app/layout.tsx`),
   `app/sitemap.ts` and `app/robots.ts`. Never hardcode the origin in a component.
4. The root `app/page.tsx` is a server `redirect()` into `/tools/judgewright`.

## 1. Design system ("Reference Target", `DESIGN.md`)

5. **Every colour has one job.** `agree` = judge matched human, `miss` = disagreement,
   `caution` = a limit or weak signal, `select` = primary action, focus and selection. The
   `wedge-0…5` neutrals carry only the agreement bands; `label-0…7` only identify label
   classes. None of them is decoration.
6. The charcoal **bezel** (`bezel-*`) frames the header and the report meta strip in both
   themes. Neutrals are `ground`, `panel`, `sunk`, `line`, `ink`/`ink-2`/`ink-3`.
7. **Colours come only from the tokens** in `app/globals.css` (RGB triplets, `:root` light,
   `.dark` dark) through their Tailwind names. **Never** a default Tailwind palette class;
   hex literals are banned outside the token blocks and generated images.
8. Archivo (width axis) for UI and prose; Fragment Mono only for machine data: verdict rows,
   receipts, figures, keycaps, the meta strip. Figures are tabular (`.figures`).
9. `DESIGN.md` (root) plus `.impeccable/design.json` is the design source of truth. A visual
   change that deviates updates both in the same commit.
10. Banned: eyebrows above headings, 01/02 section numbers, hero-metric tiles, grids of
    same-size icon cards, gradient text, glass/blur, emoji used as icons, coloured
    left borders thicker than 1px, chat-bubble templates, fake dashboards.
11. Shadows: `shadow-lift` (report frame) and `shadow-pop` (overlays) only. Radius:
    `rounded-[3px]` for controls, panels and overlays; `.patch` (2px) for swatches.
12. `ease-out-expo` is the ONE curve; transitions are 150ms colour changes. The one authored
    animation is `marker-settle` (420ms). No animation runtime.

## 2. Layout & composition

13. One page: bezel header → `h1` + three promises → `#workstation` (verdicts | report) →
    `#failures` → `#signals` → `#share` (the last three only once a report exists) →
    `#matrix` (compare) → `#guide` (method) → `#faq` → family footer.
14. **No max-w on `<main>`.** `<main>` = `w-full overflow-x-hidden`. Every section inside it is
    `mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8` (16px gutters on phones).
15. Exactly one `<h1>`. `header`/`main`/`footer` landmarks are present. A skip link targets
    `#workstation`. Page regions are labelled.
16. The workstation is `lg:grid-cols-[minmax(0,36fr)_minmax(0,64fr)]` and stacks below `lg`.
    Never a stepper of stage tabs, never a bento of equal panels.
17. The three promises stay visible under the H1: "Computed in your browser" · "Nothing is
    uploaded" · "No account needed". Each must stay literally true.
18. Mobile (390px): no horizontal scroll; `#signals` and `#share` fold to their headings;
    the comparison is one `<details>` per criterion. Keep the page near 6,300px or shorter.

## 3. Interaction & accessibility (BAR §2.5)

19. **Every control implements all five interaction states**: default, hover (clearly
    distinct), active/focus-visible (ring or clear border change), disabled (reduced opacity),
    and loading. No control may ship with fewer.
20. The required keyboard set: `⌘K` / `⌃K` palette, `⌘P` / `⌃P` samples menu (the input
    panel's copy; the header copy keeps its own state), `⌘⇧C` / `⌃⇧C` copy the one-line
    verdict, `⌘↵` / `⌃↵` focus the primary input. Never bind `⌘1–9` (browser tab switching).
21. Copy is instant everywhere: no hover-reveal, no popup. Success and failure toasts live in
    `components/ui/toast.tsx` with the `data-toast-variant` hook the e2e suite asserts.
22. All five workflow states exist and are all reachable: success · empty · error · processing
    · no-pdf / no-worker. The no-pdf and no-worker paths are exactly the same as success, and
    the "processing" state is a true intent-bearing loading state.
23. Reduced motion has a global kill-switch (`prefers-reduced-motion` in `globals.css`) that
    zeroes transitions and animations. Never ship an animation without it.
24. Errors are copy, never exceptions. User-facing failure text is literal, states cause and
    next step, and carries no verbatim exception message.

## 4. Architecture & compute core (BAR §4)

25. **`_lib` is pure.** No React, no DOM, no `localStorage`, no `fetch`, no IO. `_workers`
    imports only `_lib`. `_components` and `_hooks` may import `_lib` and `_store`, never the
    reverse. `_workers` and `_lib` are never imported by `page.tsx` transitively at top level.

    **Dormant IO seam:** `_services/llmDiagnosis.ts` (BYOK OpenRouter call) and its tests stay
    in the repo, but since the 2026-10 redesign **no UI imports it** (owner decision) and
    `https://openrouter.ai` is not in `DECLARED_ORIGINS`. Re-surfacing it needs an owner
    decision, the origin back in the CSP, the FAQ privacy answer updated, and the
    "no diagnosis surface" e2e test changed in the same commit.
26. Every cap, budget and key lives in `_lib/constants.ts` — one import site, verified with a
    grep for duplicate values.
27. **Worker protocol.** Monotonic request ids; the stale-response guard drops a late reply
    *before* it can touch state. Adaptive debounce: `≤5,000 → 0ms`, `>5,000 → 40ms`,
    `>20,000 → 120ms`, `>200,000 → 250ms`. The watchdog is **tiered by payload size** —
    `watchdogMsFor(chars)`: `≤20,000 → 1,500ms`, `≤200,000 → 3,000ms`, `≤2,000,000 → 5,000ms`,
    above → `8,000ms`. On fire it terminates, kills timers, bumps the request id (so any zombie
    reply is stale), respawns, and settles a friendly error **atomically** — the stats and the
    window are cleared in the same `set()` that records it. The tiering (A2) exists because a
    flat 1.5s wall aborted legitimate 200k-row dispatches, which the "an in-cap input always
    settles a report" contract (`e2e/perf.spec.ts`, **AC-27 / AC-59**) forbids. The 1,000ms cooperative deadline is what
    decides whether the bootstrap CIs survive; a trip drops CIs only, never a point statistic,
    never `B`, never the baseline.
28. **ONE degradation path** (`degradeToMainThread`) that kills timers, flips
    `isWorkerAvailable`, announces in one `set()` with zero orphan workers, and runs the **same**
    pure core synchronously under `SYNC_DEADLINE_MS` (stricter than the worker budget). The
    fallback is never asynchronous-function-shaped. On that path **only**, the parse carries the
    same absolute budget, checked every 512 rows (`parseDeadlineArmed`, A10) — the worker path
    parses unbudgeted by design, under its own tiered watchdog.
29. Cooperative budgets are checked inside the worker **before** every phase; on abort, the
    main thread state flag flips on the *next* guarded check — never blind, never mid-`set()`.
30. Errors are values (`ok: false`), never throws. A last-resort envelope exists for
    catastrophic rejection and reports consistent counts rather than zeros.
31. A phase deadline tripping may abort CIs; it may **never** change the point statistics.
32. Duplicate/conflicting rows, type errors and encoding corruption are counted and disclosed.
33. `_lib` contains **no transcendentals** (`Math.log/pow/exp/sqrt/sin/cos/atan` are absent).
    Deterministic agency is the default in a tool whose promise is "reproducible".

## 5. Privacy, auth & packaging (BAR §5)

34. Client-only products never feed the server. No telemetry as a proxy, no shadow endpoints.
35. CSP and HSTS are in `next.config.ts`: `default-src 'self'`, `frame-ancestors 'none'`,
    `base-uri 'self'`, `object-src 'none'`, `form-action 'self'`, `script-src`/`style-src`
    `'unsafe-inline'` only (no `unsafe-eval` in production), `worker-src 'self' blob:`,
    `connect-src` built **only** from `DECLARED_ORIGINS`. `poweredByHeader: false`.
36. **No LLM call ships.** `DECLARED_ORIGINS` is `'self'` plus Supabase only
    (`csp.test.ts` asserts openrouter is absent), and the zero-egress guard in
    `e2e/visual.spec.ts` fails CI on any non-localhost request during first paint and a full
    compute.
37. **Auth is env-gated.** Unset env keys ⇒ `isSupabaseConfigured` is false, the client is a
    `null` no-op, no bootstrap, no listeners, zero backend connections, and the tool is 100%
    usable. The auth surface explains rather than locking. Sign-in never blocks core work.
38. Sign-in offer points: a return visit (`sessionCount ≥ 2`) and on export. Both are offers,
    not walls.
39. Production runs `output: "standalone"` under PM2 as `judge-norai` on 127.0.0.1:3005 behind
    nginx + certbot. The Docker/Caddy artifacts are maintained in parallel; deleting one for
    the other is forbidden.

## 6. Gates & recipes (BAR §6, context.md §4.5)

40. Redesign work lands on the `redesign` branch; never push or deploy unless the owner asks. Commit with repo-local identity, never
    `--no-verify`. No new dependencies unless they already pay for themselves in the bundle.
41. CI runs typecheck → lint → unit → build → Playwright. Playwright boots the **standalone**
    artifact on 3005 (never the dev server, except via the documented `PW_DEV=1` escape
    hatch). Pixel baselines ship GREEN-or-SKIPPED, never RED on stale goldens.
42. Playwright must only drive the UI (verified selectors, visible-over-hidden, no hard-coded
    CSS lookups, no fixed `page.waitForTimeout`), snapshot-stable output, and never assert on
    brittle DOM counts.
43. A change is "working end to end" only when **both** gates pass: the component-level
    workout (`npm test`) and the end-to-end proof (`npm run test:e2e`), plus
    `npm run typecheck`, `npm run lint` and `npm run build`. One suite passing is not a pass.
44. The pure core coverage thresholds are functions ≥ 90, lines ≥ 80, statements ≥ 80, branches
    ≥ 70 (`vitest.config.mts`, scoped to `_lib`).

## 7. Seam discipline

45. `_lib/analyze.ts` is the pure seam for statistics. It is replaced — never polluted with
    parsing, React, or IO. The worker hook, the store and the UI must survive its replacement
    untouched.
46. `_lib/types.ts` imports nothing at runtime. Anything shared between the worker and the UI
    starts there.
47. Each AC in the plan cites the file that proves it. If you change a contract, update the
    test that guards it in the same commit.
