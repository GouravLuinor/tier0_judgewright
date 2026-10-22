# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

ML and AI engineers who already run an LLM-as-judge (a grader prompt that labels model outputs pass/fail or on a scale) and have a few hundred human labels for the same examples. They need to know whether the judge can be trusted before it gates a release, a dashboard or a training signal. Secondary: eval leads and reviewers who receive the resulting report and must decide whether to accept the judge. They arrive from search ("llm judge calibration", "cohen's kappa llm judge", "llm as a judge human agreement", "krippendorff alpha calculator") or from a teammate's shared report, usually with a JSONL or CSV export already on disk.

## Product Purpose

Judgewright takes judge verdicts paired with human labels and returns a calibration report: how much of the apparent agreement survives a chance correction (Cohen's κ, Krippendorff's α), with seeded bootstrap error bars, a confusion matrix, the exact examples where judge and human disagree, calibration (ECE/Brier) and position/length bias when the data carries them, and a reproducibility receipt. Success: in under a minute the engineer knows whether to ship the judge, which disagreements to read next, and has a report a reviewer can recompute.

## Positioning

- It measures the judge you already have. It never runs a judge, never calls a model by default, and never needs an account.
- Everything is computed in the visitor's tab in a Web Worker. No upload, and the CSP enforces it: verdicts and labels often contain customer or proprietary data, which is why this matters.
- It refuses the flattering number. Raw agreement, the chance-corrected coefficient and the gap between them sit together, so a judge riding a skewed label set cannot pass as good.
- Reproducible by construction: same rows and seed give byte-identical numbers, and the receipt prints formula, inputs, seed and replicate count.
- Generic alternatives are hosted eval platforms (account, upload, judge-runner lock-in), notebook one-liners (a bare κ with no interval, no α, no disagreement view) and spreadsheets. Compare against categories, never named brands.

## Operating Context

Inputs are JSONL or CSV rows with `example_id`, `judge_label`, `human_label`, optionally several human raters, judge scores/probabilities, critiques, position and length fields. Typical sets are 100–5,000 rows; the engine accepts up to 200,000. Work happens on a laptop next to a notebook or eval pipeline, usually in a dark-themed editor environment, and is repeated every time the judge prompt or model changes. Results get copied into PRs, docs and Slack.

## Capabilities and Constraints

- Engine (do not change behaviour): parser with label-vocabulary rule, confusion matrix with binary and k-class metrics, unweighted + weighted κ, chance baseline, Δκ deflation, Krippendorff's α (nominal default; ordinal/interval wired in options but no selector UI), seeded bootstrap CIs tiered by row count, Landis–Koch letter grade (a convention, disclosed), ECE/Brier, position/verbosity bias, windowed per-example disagreement table (2,000-row window, true totals shown), reproducibility receipt.
- Exports: copy card, copy one-liner, copy JSONL, download bundle, markdown report. All work without an account.
- BYOK LLM diagnosis: the service (`_services/llmDiagnosis.ts`) stays in the codebase, but the owner decided (2026-10-22) it is not surfaced in the UI. Do not re-add the panel without asking.
- Optional sign-in (shared Nor AI Supabase project) is a convenience only. It may be offered on export; never unprompted.
- CSP `connect-src` lists only self, Supabase (optional sign-in) and openrouter.ai (kept for the dormant BYOK service).
- Budgets: cooperative compute deadline drops CIs only, never point statistics. Watchdog must never abort before the worker is ready.
- Canonical origin: https://judge.norai.tech (owner decision, 2026-10-22). It returned no response in the Oct 2026 audit while judgewright.norai.tech was live; DNS/nginx must point judge.norai.tech at the app, and judgewright.norai.tech should 301 to it.

## Brand Commitments

- Name: Judgewright, part of the Nor AI tier-0 family. Each tool has its own visual world; the shared thread is a small Nor AI mark linking to https://norai.tech, the family footer ("Built by Nor AI", "More free tools") and cross-links.
- Free, no sign-up for every deterministic feature.
- Ships light and dark themes.

## Evidence on Hand

- Built-in sample: 12 hand-checkable pass/fail rows (`app/tools/judgewright/_lib/presets.ts`), plus the demo sets behind the Samples menu.
- Measured performance in `BENCHMARKS.md` (1,000 rows ≈ 19 ms, 100,000 rows ≈ 873 ms on the measuring machine). Quote only with that context.
- Test suite: 361 unit tests, Playwright journeys including a zero-egress request guard.
- No testimonials, user counts, logos or press exist. Do not fabricate them.

## Product Principles

1. The verdict is the hero: "can I trust this judge?" is answered before any table.
2. Never flatter: chance-corrected first, raw agreement beside it, uncertainty always visible.
3. Show the receipts: every figure can be recomputed from what's on screen.
4. One next step at a time: verdict → where it fails → why → share. Depth stays one click away, never in the way.
5. Honest states: loading says loading; a limit says which limit and what to do.

## Accessibility & Inclusion

WCAG 2.2 AA. Full keyboard operation including the existing shortcut set (⌘K palette, ⌘P samples, ⌘⇧C copy, ⌘↵ focus input). Agreement/disagreement never carried by colour alone. Numbers use tabular figures.
