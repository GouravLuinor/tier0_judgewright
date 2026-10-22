---
version: 1
slug: "app-tools-judgewright-page-tsx"
primary_target: "app/tools/judgewright/page.tsx"
related_targets: []
---

Scope: /tools/judgewright, the whole page. Visitor mode: Operate for the first viewport and the calibration flow (verdict → where it fails → why → share); Persuade/Read for the sections below (how it compares, method, FAQ).
Audience & job: ML engineers with LLM-judge verdicts plus human labels who must decide whether to trust the judge. Proof: the live report on their own data, the receipt, zero-upload CSP.
Memorable moment: the confusion matrix printed as a calibration target of split patches (human half | judge half); the off-diagonal patches are the judge's errors, and clicking one opens those exact examples.
Unresolved: α level and ECE binning selectors (engine supports, no UI). BYOK diagnosis intentionally not surfaced (owner, 2026-10-22).

## Direction contract
THESIS: The judge is an instrument calibrated against a reference target; the page reads its result off the chart. Refuses the category default: a stepper of tabs, four equal hero-metric tiles and a dark cockpit of equal panels.
OWN-WORLD: Matte charcoal bezel (#1c1c1b family) owns the header and the report frame in both themes. Light ground is a neutral grey card (no cream); dark ground is the chart's black. Data and state colours are the ColorChecker patches: bluish-green = agreement, moderate red = disagreement, orange-yellow = caution, purplish-blue = selection/focus, the six-step neutral row = the agreement-band step wedge. Archivo (width axis) for UI and figures, Fragment Mono for rows and receipts. Square 2px patches, 1px rules, patch numbers in small figures.
STORY: Paste or load a sample. Read one sentence plus κ on the wedge. See how far raw agreement flatters. Open the disagreements and read both critiques. Check bias/calibration if present. Copy the report or receipt.
FIRST VIEWPORT: Bezel header (wordmark, Calibrate/Method/FAQ, Samples, theme, quiet Sign in). H1 "Calibrate your LLM judge against human labels" with a one-line sub. Left ~36%: "Your verdicts" (drop/paste, row count, sample menu, rubric disclosure, schema hint). Right ~64% inside the bezel frame: verdict sentence, κ at display size with CI on the step wedge, raw vs chance vs Δ on the same scale, population strip of every row, primary action "Read the N disagreements".
FORM: Reference Target (ColorChecker / test chart), candidate 5 of 7 on my ordered list; seed key 95e5ccc8. Signature: split-patch target matrix. Raises: population strip (datamatics); one shared −1…1 scale (botanical folio); focus-and-dim disagreement inspector (streaming wall); one printed intensity ramp (star atlas).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
