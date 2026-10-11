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

## 1. Design system (BAR §3)

5. **One accent only.** `brand-lime` is the single non-neutral hue on the entire page. It is
   worn only by: settled measurement, the primary action, active/focus state, and plane
   separation. It is absent from every headline, every icon and most body text.
6. **Semantic state colors only.** `bg-brand-amber/10` = warning (degraded banner, capped
   output). `bg-brand-rose/10` = error. Violet and amber are reserved for promotion/deprecation
   callouts and citation links — never for interactive elements.
7. **Colors come only from the Matchlight token ladder** in `app/globals.css`
   (`surface-*`, `brand-*`, `code-*`) plus the inverted zinc neutrals
   (`text-zinc-100/300/400/500`). **Never** a default Tailwind palette class and never a named
   palette (`sky-500`, `emerald-600`…). Hex literals are banned outside `:root`/`.dark`.
8. Mono type (`font-mono`) is reserved for machine data: verdicts, code, stats, dates,
   keyboard chords, badges, and captions.
9. Every typography/style decision obeys `docs/DESIGN.md`. Visual and content generation is
   forbidden from deviating without updating `design_tokens.json` and `docs/DESIGN.md`.
10. No chat-bubble template, no marketing-slogan generic grid, no fake dashboard with
    hardcoded "98% success" style decoration, no stock-illustration filler.
11. `boxShadow`: only `shadow-raycast` (inset hairline + lift) and `shadow-elevated`
    (large surface lift). `rounded-*`: hard-capped `rounded-2xl` for the biggest surfaces;
    everything else `rounded-lg`/`rounded-xl`/`rounded-md`. `blur` is only
    `backdrop-blur-[6px]` behind the header.
12. `ease-out-expo` is the ONE curve (`cubic-bezier(0.16, 1, 0.3, 1)`). `framer-motion`
    and every other animation runtime are **absent** — CSS transitions only, never exceeding
    300ms.

## 2. Layout & composition (BAR §2)

13. One page per tool section that hosts everything: header → station (`h1` + trust pills) →
    workstation card → comparison → guide → FAQ → footer.
14. **No max-w on `<main>`.**
    `<main>` = `w-full overflow-x-hidden` (full viewport). Every section inside it is
    `mx-auto w-full max-w-7xl px-4 md:px-6 lg:px-8`. Sticky nav lives inside the header, not
    clipped by the main container.
15. Exactly one `<h1>`. `header`/`main`/`footer`/`contentinfo` landmarks are present. A skip
    link targets the workstation card. Page regions are labeled with `aria-label`.
16. The two-pane workstation grid is `lg:h-[620px] lg:grid-cols-2` with both panes `h-full
    min-h-0`; below `lg` it stacks. Never a 3-pane bento, never `grid-cols-3`.
17. Trust pills always visible: `100% in-browser` · `Chance-corrected κ` · `No account
    required`.
18. Preset menus are inline in the toolbar; the command palette (`⌘K`) and the sign-in modal
    are globally mounted and complete the organization.

## 3. Interaction & accessibility (BAR §2.5)

19. **Every control implements all five interaction states**: default, hover (clearly
    distinct), active/focus-visible (ring or clear border change), disabled (reduced opacity),
    and loading. No control may ship with fewer.
20. The required keyboard set: `⌘K` / `⌃K` palette, `⌘P` / `⌃P` samples menu, `⌘⇧C` / `⌃⇧C`
    copy the current output, `⌘↵` / `⌃↵` focus the primary input.
21. Copy is instant everywhere: no hover-reveal, no popup. Success is a brand-lime toast,
    failure is a rose toast, and both live in `components/ui/toast.tsx` with the
    `data-toast-variant` hook the e2e suite asserts.
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
26. Every cap, budget and key lives in `_lib/constants.ts` — one import site, verified with a
    grep for duplicate values.
27. **Worker protocol.** Monotonic request ids; the stale-response guard drops a late reply
    *before* it can touch state. Adaptive debounce: `≤5,000 → 0ms`, `>5,000 → 40ms`,
    `>20,000 → 120ms`, `>200,000 → 250ms`. Watchdog at `1,500ms` terminates, kills timers,
    bumps the request id (so any zombie reply is stale), respawns and settles a friendly error.
28. **ONE degradation path** (`degradeToMainThread`) that kills timers, flips
    `isWorkerAvailable`, announces in one `set()` with zero orphan workers, and runs the **same**
    pure core synchronously under `SYNC_DEADLINE_MS` (stricter than the worker budget). The
    fallback is never asynchronous-function-shaped.
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
36. **The optional LLM flow is off by default and never automatic.** With no key the flow is a
    no-op. `AUTO_DIAGNOSIS_ENABLED` is `false`, the single origin it would use
    (`https://openrouter.ai`) is already whitelisted, the dedup guard reduces duplicate calls,
    the bundle cap is enforced and a reload closes the panel — and the zero-egress guard in
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

40. Work only on `main`; never push to another branch. Commit with repo-local identity, never
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
