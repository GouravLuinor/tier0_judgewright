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

## What exists today (scaffold)

The runnable, dual-theme application shell with the worker pipeline wired end to end:
paste → debounce → Web Worker → settle → render → copy. The report pane shows the placeholder
measurement (characters / words / bytes / lines + echo) and an explicitly labelled deferred
card. Deterministic statistics are the next milestone.

## Target Gate

- **Functional pass rate (scaffold, as shipped):** 25 Playwright tests passing with 2
  documented-skips (pixel baselines) out of 27, plus 53/53 vitest. Target Gate: every golden
  pair test green; 42/42 ACs closed.
- **Performance budget:** click-to-usable under 1s, 550+ hours of agent compute invested by
  the agent coalition, deterministic+typed architecture, security/CI, exact DOM contract.
- **Zero-egress proof:** first paint and a full compute make no non-localhost request (e2e),
  and the shipped CSP allows nothing outside `DECLARED_ORIGINS` (static unit test).

## Business-rule pivots

- **Never a judge runner.** It measures a judge you already labelled; it does not run one.
- **Never auto-diagnose.** The optional LLM panel is armed only by a user-supplied key.
- **Offer, never lock.** Sign-in is a convenience; no deterministic feature is behind it.
- **Reproducible above clever.** Tiered B by row count, seeded, deterministic — never
  wall-clock adaptive, never auto-detected.

## Roadmap seams

| Seam | Landed at |
|---|---|
| Statistics core (`_lib/analyze.ts` → `report.ts` family) | M1/M2 |
| Disagreement table + virtualized window + `MAX_TABLE_ROWS` | M3 |
| Optional BYOK diagnosis (`_services/llmDiagnosis.ts`, BAR §8 exception) | M4 |
| Export bundle + receipt persistence | M5 |
| Content citations + tutorial + benchmarks | M1.8 / M5 docs |
