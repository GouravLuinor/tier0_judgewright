# Judgewright — product facts

Delivered surfaces, performance targets and business-rule pivots for the calibration
instrument, and the roadmap for the seam each gap ladders into.

## Product

Paste a rubric and a set of JSONL/CSV verdicts; Judgewright returns a calibration report card:
confusion matrix, raw agreement, chance-corrected agreement (Cohen's κ, Krippendorff's α),
agreement-to-κ deflation, seeded reproducible bootstrap CIs, and a Landis–Koch grade. Optional
panels cover calibration (ECE/Brier), per-class precision/recall/F1, position/length bias, and a
confidence histogram. Every figure carries a reproducibility receipt (seed, replicate count,
budget, engine).

## What exists today (shipped v1.0.0)

The whole product: a dual-theme application shell with the worker pipeline wired end to end
(paste → debounce → Web Worker → settle → render → copy) **and the full deterministic
statistics engine behind it** — parser and label-vocabulary rule, confusion matrix with
binary and k-class metrics, unweighted + weighted Cohen's κ, the chance baseline, the
Δκ-deflation headline, Krippendorff's α at all three levels, seeded byte-reproducible
bootstrap CIs, the Landis–Koch letter grade, ECE/Brier with both score semantics, the
position/verbosity bias panel, the per-example disagreement table, and the reproducibility
receipt. The report pane shows measured numbers or an honest "not computable from your
input" reason — never a placeholder.

## Gate (as shipped)

- **Functional pass rate:** **48 Playwright tests passing** with 2 documented-skips (pixel
  baselines) out of 50, plus **361/361 vitest** across 24 files — `npm run test:e2e` and
  `npm test` both exit 0.
- **Coverage:** statements 94.4% · branches 79.24% · functions 98.62% · lines 96.77%, scoped
  to `_lib`, all above the configured thresholds.
- **Bundle:** `/tools/judgewright` First Load JS **199 kB** against the 200 kB budget.
- **Performance:** measured in `BENCHMARKS.md` — a 1,000-row session settles in ~19 ms, a
  100,000-row session in ~873 ms, and a 200,000-row dispatch settles (never aborts) at a
  median 1,011–1,361 ms.
- **Zero-egress proof:** first paint and a full compute make no non-localhost request (e2e),
  and the shipped CSP allows nothing outside `DECLARED_ORIGINS` (static unit test).

## Business-rule pivots

- **Never a judge runner.** It measures a judge you already labelled; it does not run one.
- **Never auto-diagnose.** The optional LLM panel is armed only by a user-supplied key.
- **Offer, never lock.** Sign-in is a convenience; no deterministic feature is behind it.
- **Reproducible above clever.** Tiered B by row count, seeded, deterministic — never
  wall-clock adaptive, never auto-detected.

## Seams (all landed)

| Seam | Status |
|---|---|
| Statistics core — `_lib/analyze.ts` + the `report.ts` family | **shipped** (D1/D2) |
| Disagreement table + `MAX_TABLE_ROWS` window + honest totals | **shipped** (D2/A3) |
| Optional BYOK diagnosis (`_services/llmDiagnosis.ts`, BAR §8 exception) | **shipped** (D3/A11) |
| Export bundle + receipt | **shipped** (D3) |
| Content citations + tutorial + benchmarks | **shipped** (`docs/`, `tutorial.md`, `BENCHMARKS.md`) |
| α-level + ECE binning **selector UI** | **not shipped** — wired in `ComputeOptions`, no UI yet; the engine defaults to nominal α + equal-width 10-bin ECE and discloses which it used |
| Pixel baselines | **skipped by policy** until a human regenerates the goldens |
