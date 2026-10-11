# Judgewright — SPEC (v1, planning artifact)

> **Status:** PLANNING DOCUMENT — no production code, no scaffold. Written by the
> overnight PLANNER agent; revised by the PLAN REVISER (review-driven pass, all
> CRITICAL/MAJOR/MINOR findings encoded). Companion docs:
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`PLAN.md`](./PLAN.md). Both are the
> contract the build agents must satisfy.
>
> **Bar:** `ORCHESTRATION/BAR.md` §10 (18-item exit gate). **Canonical sibling:**
> `regex-craft/` (Matchlight design system, worker contract, five green gates).
> **Ports/subdomain/PM2:** 3005 · `judge.norai.tech` · `judge-norai` (D3).

---

## 0. One-paragraph definition

**Judgewright is a calibration instrument for the grader you already ship.** You paste a
rubric and a set of verdicts — `{example_id, judge_label, human_label, judge_critique?,
human_critique?, judge_score?, human_score?, human_labels?[]}` — and Judgewright returns a
**report card** that tells you, with error bars, whether your LLM judge is actually
measuring anything: confusion matrix, TPR/TNR/PPV/recall/F1, Cohen's κ (**unweighted κ is
the headline; weighted-linear/quadratic κ is a labelled secondary row**),
Krippendorff's α, **the chance-corrected agreement headline and the agreement-to-κ
deflation Δ**, seeded reproducible bootstrap CIs, ECE, Brier, a letter grade, and a
per-example disagreement table. The statistics core is 100% client-side and
deterministic — it *is* the product. Exactly one optional, opt-in, BYOK, ephemeral LLM call
can add a written diagnosis (rubric holes / bias flags / misapplications / priority fix);
it never logs a payload, and without a key the whole tool is a clean no-op.

**It is *not* an LLM that grades.** Nothing here runs a judge, ranks answers, or scores a
response. It only measures a judge you already have labels for.

### The scientific hook (motivation, cited — never a claim the tool makes)

- **arXiv 2606.19544, "Reliability without Validity"** (submitted 2026-06-17): exact-match
  agreement **overstates chance-corrected agreement by 33.8–41.3 pp across 21 models**
  (cohort mean **38.6 pp**); a judge reporting "85% agreement" on MT-Bench can carry
  **κ ≈ 0.48**. Judgewright's headline prints *raw agreement, κ, and the Δ between them*,
  so a 95% accurate judge on a 5%-error set is exposed instead of celebrated.
- **arXiv 2606.00093** (v1 2026-05-25): protocol choice alone moved accuracy **0.551 → 0.899**
  and carried κ across zero **without altering a verdict**. Judgewright therefore displays
  the tiny numeric readouts (κ, Δ, CI width, B) and never rounds them into a friendlier
  story.
- **Local proof of the hook** (in-repo fixture, `AC-10`): 1,000 binary verdicts at **95.0%
  raw agreement** carry **κ = 0.5192307692307692** — a **43.08 pp deflation**. The tool
  shows both numbers, side by side, on the headline card.

These citations motivate the product; they are **cited, not computed by this tool** — every
third-party number in any user-facing string carries a source link and the words "cited, not
computed by this tool" (`AC-56`). Judgewright computes only what the user's own rows
arithmetically support, and says so when it cannot.

---

## 1. Users & jobs-to-be-done

| Persona | Situation | Job to be done | Judgewright's answer |
|---|---|---|---|
| **Eval engineer, "we shipped an LLM judge"** (primary) | A judge drives a regression gate or a leaderboard slot; nobody has validated it against humans. | "Prove to my team how much to trust this judge, with an error bar." | unweighted κ + CI + letter grade + the deflation Δ, reproducible to the digit. |
| **ML engineer debugging a judge** | The judge looks fine in aggregate but fails on some slice. | "Show me *which* examples it gets wrong, and what the humans said instead." | Per-example disagreement table, critiques side-by-side in markdown, filterable. |
| **Research / safety engineer** | Needs an inter-rater figure for a paper or an audit. | "Give me Krippendorff's α and the human ceiling, not a correlation." | α (nominal/ordinal/interval) over the coder panel `[judge, human₁, …]` with the mandatory 2-coder disclosure; human-only α (`alphaHumans`) when ≥2 human raters. |
| **Rubric owner** | Suspects the rubric, not the judge, is the failure. | "Tell me where the rubric is ambiguous." | The one opt-in BYOK diagnosis (rubric holes, bias flags, misapplications), plus the deterministic confusion cells. |
| **Reviewer / skeptic** | Doesn't trust any tool's statistics. | "Let me recompute this myself." | Every statistic ships with its **reproducibility receipt** — the exact inputs, formula, seed, `B`, deadline and engine. |

**JTBD statement (primary):** *When I have an LLM judge producing labels against a set of
human-labeled examples, I want a single report card that tells me the judge's chance-corrected
agreement and its uncertainty, so that I can decide whether to trust it — in under a minute,
without uploading my private evaluation set anywhere.*

---

## 2. MVP feature set (v1) — specified precisely

### 2.1 Input & parsing (`_lib/parse.ts`, `_lib/csv.ts`, `_lib/labels.ts`)

1. **Paste or drop** JSONL or CSV (`example_id`-keyed verdicts). Drag-and-drop files are
   read with `File.prototype.text()` — never uploaded.
2. **Auto-detect columns** via a documented alias table (`AC-14`):
   - `example_id` ← `example_id`, `id`, `example`, `uid`
   - `judge_label` ← `judge_label`, `judge`, `verdict`, `prediction`, `predicted_label`, `judge_verdict`
   - `human_label` ← `human_label`, `gold_label`, `label`, `reference_label`, `human`, `expected`
   - `human_labels[]` ← `human_labels`, `human_ratings`, `raters` (JSON array *or* comma-separated)
   - `judge_score` ← `judge_score`, `judge_confidence`, `confidence`, `score`, `probability`
   - `human_score` ← `human_score`, `human_confidence`
   - `judge_critique` ← `judge_critique`, `judge_reason`, `judge_rationale`, `reason`
   - `human_critique` ← `human_critique`, `human_reason`, `human_rationale`, `note`
   - optional bias columns ← `position` (0/1 slot), `preferred_longer` (bool)
   - optional passthrough ← `input`, `output` (shown in the disagreement table + sent to the LLM)
3. **Robust parse with helpful errors.** Every failure is a *value* with a **line number and a
   reason** (`line 42: missing "example_id"`, `line 17: judge_score "high" is not a number in
   [0,1]`). The first 5 issues are listed with the offending line quoted. Every failure is
   classified into exactly one of **six error classes** (`AC-14`): `structure` (bad JSON line,
   CSV field/header mismatch, single-column file), `missing-field` (`example_id`,
   `judge_label`, `human_label`), `bad-value` (non-numeric or out-of-range score,
   non-string label), `vocabulary` (two known label families in one column — hard error),
   `capacity` (`MAX_COLS` / `MAX_ROWS` / `MAX_INPUT_CHARS` exceeded), and `ambiguity`
   (two distinct columns claim the same semantic slot).
4. **Label vocabulary — the validity rule (decided, C5).** *Unknown-but-consistent values are
   valid and become the label set.* The parser computes the set of **known families**
   (`pass/fail`, `yes/no`, `true/false`, `1/0`, `good/bad`, `a/b`) present among the
   normalized values. The set is invalid — a hard error, no report, offending set listed
   (`FM-2`) — **only when two values normalize into two different known families**
   (`PASS`+`TRUE`, `0`+`NO`, `PASS`+`1`). One known family plus unknown members, or all
   unknown members, is a perfectly good k-class label set (e.g. `{GOOD, OK, BAD}`,
   `{RED, GREEN, BLUE}`) and ships a full k-class report.
5. **`judge_score` semantics — two explicit modes, never auto-detected (decided, C2).**
   `judgeScoreMode: "p-positive" | "confidence"` (default `"p-positive"`), chosen by the user
   in a labelled toolbar control; **there is no auto-detect**. In **`p-positive`** mode the
   score *is* P(judge_label = positiveClass). In **`confidence`** mode the score is the
   judge's confidence in whatever label it emitted, so the probability of the positive class
   is `s` when the judge labelled the row positive and `1 − s` otherwise. `ece()`/`brier()`
   receive `positiveClass` and perform this flip internally. **Ambiguity is explicit**: if
   two distinct source columns map to the same semantic slot, label/id slots raise the
   `ambiguity` hard error; a duplicated **`judge_score`** slot makes the calibration panel
   *not computable* with its own reason copy while the rest of the report still computes.
   A numeric score outside `[0,1]` is a line-numbered issue and the score is **treated as
   absent — never silently clamped** (`AC-37`).
6. **≥2 human raters** via arrays; α is computed over the coder panel `[judge, human₁, human₂…]`
   with the mandatory disclosure of `AC-50`.
7. **Optional rubric text** in its own pane (free text, up to 8,000 chars).
8. **Parse decision table** — every row below is a pinned fixture with pinned copy
   (`AC-14`); "row" issues skip one row and continue, "hard" errors abort with no report:

   | # | Condition | Class | Behavior | Copy (verbatim) |
   |---|---|---|---|---|
   | 1 | missing `example_id` | `missing-field` | row skipped | `line 42: missing "example_id"` |
   | 2 | non-numeric score | `bad-value` | score treated as absent | `line 17: judge_score "high" is not a number in [0,1]` |
   | 3 | out-of-range score | `bad-value` | score treated as absent, **never clamped** | `line 17: judge_score 1.7 is outside [0,1] — treated as absent, never clamped` |
   | 4 | duplicate `example_id` | warning only (not one of the six error classes) | **both rows kept as independent examples** | `duplicate example_id "X42" — rows are counted independently` (first 5 ids listed) |
   | 5 | ≥1 human label but missing `judge_label` | `missing-field` | row skipped | `line 9: missing "judge_label"` |
   | 6 | `MAX_COLS` exceeded | `capacity` | hard error, nothing parsed | `header lists 71 columns — the limit is 64` |
   | 7 | single-column file | `structure` | hard error, nothing parsed | `single-column input: need at least example_id and one label column` |
   | 8 | bad JSON line | `structure` | row skipped | `line 3: invalid JSON — could not parse` |
   | 9 | CSV header/col count mismatch | `structure` | row skipped | `line 8: CSV row has 4 fields, header has 6` |
   | 10 | `rowCount > MAX_ROWS` | `capacity` | **capped before analysis**: the parser stops materializing rows at `MAX_ROWS` while still counting the true total; the amber strip shows the real total; export carries only the analyzed rows | `Results capped at 200,000 of 1,000,000 rows.` |

### 2.2 Deterministic statistics core (all pure, all in a Web Worker)

| Statistic | Definition shipped |
|---|---|
| Confusion matrix | rows = human, cols = judge, labels sorted; binary + k-class; the header prints the **positive class** (`AC-51`) |
| TPR / TNR / PPV (precision) / recall / FPR / F1 | binary, **positive class = second sorted label by default, user-selectable via `positiveClass`**; macro + per-label for k-class |
| Cohen's κ | **unweighted κ is the headline** — it alone drives the letter grade, the Δκ-deflation and the primary κ CI; weighted-linear and weighted-quadratic κ are computed and shown as a **secondary row explicitly labelled "secondary — headline uses unweighted κ"**; `null` when undefined, with a single guard (`AC-42`) |
| Krippendorff's α | nominal / ordinal / interval over the coder panel with the `AC-50` disclosures; `interval` requires all-numeric labels; `ordinal` requires numeric labels or an explicit `labelOrder`; human-only α (`alphaHumans`) is the human ceiling when ≥2 human raters |
| **Chance-corrected headline** | always-majority baseline agreement + the fact that its κ ≡ 0 by construction (the identity is derived analytically in `chanceBaseline`) |
| **Δκ-deflation** | `rawAgreement − κ_unweighted`, printed next to both numbers; when κ < 0 the headline prints the negative-κ sentence instead of a pp figure (`AC-57`) |
| Bootstrap CIs | percentile, index-resampling over examples (`AC-49`), mulberry32, **fixed seed, byte-reproducible**, tiered `B` with the tier rule named in the CI panel (`AC-53`) |
| ECE / Brier | equal-width (10 bins) and equal-frequency modes; both take `positiveClass` and the selected `judgeScoreMode`, flipping internally (`AC-40`, `AC-41`) |
| Letter grade | documented κ bands (Landis–Koch convention **applied to unweighted κ**) → A–F, deterministic; κ < 0 ⇒ "F" / "worse than chance" (`AC-57`) |

### 2.3 Report card UI

- **Headline card**: letter grade · agreement `%` + CI · **unweighted** κ + CI ·
  Δκ-deflation · `always-majority baseline = X%` callout · n rows · runtime ms. The grade
  always prints next to its Landis–Koch label and the line *"bands are a convention — the
  numbers are the product"*.
- **Secondary κ row** (labelled): weighted-linear / weighted-quadratic κ, explicitly marked
  secondary; it never feeds the grade, the deflation or the CI.
- **Reproducibility receipt** block: the exact arithmetic (`a,b,c,d` for binary, the matrix
  for k-class, and the `mulberry32(seed)` + `B` used for the CI) plus the receipt fields
  `{seed, B, deadlineMs, ciDropped, reason, engine}` (`AC-52`) — the proof is one paste away.
- **Confusion matrix** heat table (human rows × judge cols) with the positive class printed
  in the header and switchable from the labelled toolbar control in one click.
- **Per-example disagreement table**: human vs judge, critiques side-by-side in markdown,
  filterable (all / disagreements / cell), capped at `MAX_TABLE_ROWS = 2,000` displayed in a
  virtualised window with an honest "showing X of Y" strip (export carries all rows, pulled
  on demand — `AC-59`).
- **Bias panel**: position bias and verbosity bias **only when the input carries the needed
  columns**; otherwise the panel renders *"not computable from your input — add `position`
  and/or `preferred_longer`"*. Self-preference is explicitly out of v1.
- **α panel**: level selector (nominal/ordinal/interval), the human ceiling (`alphaHumans`),
  the α CI (with `alphaReplicates` disclosed when the α-specific tier applies), and the two
  mandatory disclosures of `AC-50`.
- **Score-mode control**: a labelled toolbar control choosing `p-positive` vs `confidence`
  for `judge_score` (never auto-detected); the calibration panel shows the mode and the
  mismatch warning of `AC-41` when it fires.
- **Keyboard set** (BAR §2.6): `⌘K`/`⌃K` command palette · `⌘P`/`⌃P` preset menu ·
  `⌘⇧C`/`⌃⇧C` copy current output · `⌘↵`/`⌃↵` focus the primary input (`AC-54`).

### 2.4 Export (instant copy + download)

1. **Report card (markdown)** — compact, copy-ready.
2. **JSONL** of `{example_id, judge_label, human_label, agree}` — one line per row.
3. **One-line verdict** — copy-ready, judging-the-judge in one line; the canonical golden
   string is asserted at 17 significant digits (`AC-55`):
   `Human agreement: C · acc 73.0% [69.5, 76.7] · κ 0.33 [0.27, 0.39] · always-pass 95.0%`
4. **Reproducibility receipt** (markdown) — the formula and inputs behind κ/Δκ, including
   the `{seed, B, deadlineMs, ciDropped, reason, engine}` block.

### 2.5 Optional LLM diagnosis (opt-in, BYOK, ephemeral)

- **Exactly one call.** The payload is disclosed in the UI verbatim before it is sent: the
  **rubric text plus 25 disagreement rows**, each `{id, input, output, human_label,
  human_critique?, judge_label, judge_critique?}`. Selection is deterministic: confusion
  cells ranked by frequency, rows then picked **round-robin across distinct cells** (one per
  cell at a time, highest-frequency cell first, then the next), ties by `example_id` asc —
  and the copy says so.
- Output `{ rubric_holes[], bias_flags[], misapplications[], priority_fix }`.
- `connect-src` allows `https://openrouter.ai` **only for this flow**; the key lives in
  memory for the session (never persisted, never logged, never in a URL); the request body is
  never written to the store, `console`, or `localStorage` (`AC-18`); no retries beyond the
  user's own.
- **Aborted mid-flight**: an `AbortError` (user cancel, navigation, tab close) yields
  `DiagnosisError("aborted")`, the copy *"Diagnosis aborted — nothing was sent or stored."*,
  and the panel returns to the configure-key state (`AC-38`).
- **Clean no-op** without a key: the panel shows *"Configure a key to run the diagnosis —
  nothing is sent anywhere until you do."* Every deterministic feature is fully functional.
- A `Purge diagnosis` action clears the result and the in-memory key.

---

## 3. MVP vs Later

| v1 (MVP) | Later (documented non-goals for now) |
|---|---|
| JSONL + CSV verdicts, column auto-detect, helpful line-numbered errors | XLSX/Parquet/Arrow inputs; direct LangSmith/Langfuse/Braintrust import |
| Binary + k-class labels; weighted κ as a labelled secondary row; α (nominal/ordinal/interval) | Circular/polar metrics; Fleiss κ; Kendall τ; BCa / bias-corrected CIs; BCa intervals |
| Bootstrap CIs on agreement / unweighted κ / α | CIs on ECE, Brier, PPV per class; BCa; sample-size planner |
| ECE + Brier with `judgeScoreMode` (`p-positive` default, `confidence` opt-in) | Automatic score-mode detection; isotonic / Platt recalibration, reliability diagrams |
| Per-example disagreement table with critiques | Inline "ask the judge about this row" (would be a 2nd LLM call → forbidden in v1) |
| Position + verbosity bias | Self-preference (needs model-family columns), answer-length as a continuous covariate |
| One-shot BYOK LLM diagnosis | Streaming diagnosis, multi-judge comparison, saved runs |
| Single-rubric, single-run workbench | Running our own judge, rubric authoring/editing, A/B rubric diff |
| Markdown + JSONL export | CSV/XLSX export, shareable URL encoding of a run |

---

## 4. Non-goals (hard)

1. **We do not run an LLM judge.** No model call ever produces a verdict.
2. **More than one LLM call is out of scope** for v1 (the entire diagnosis is one request).
3. **No server-side persistence** of verdicts, rubrics, diagnoses, or API keys.
4. **No live pipeline calibration** — no polling a running judge, no scheduled re-runs.
5. **No accounts required** for any core feature (auth, if configured, only soft-gates export
   conveniences, mirroring the siblings).
6. **No paywall, no telemetry on payload content, no analytics.**
7. **No silent guessing about the user's numbers**: score-mode auto-detection, label-order
   guessing, score clamping, and zero-filled reports on unusable input are all out.

---

## 5. Success metrics (measurable at Phase 4)

| # | Metric | Target |
|---|---|---|
| S1 | Every statistic in the report matches an independently verified reference value | 100% of fixtures within **1e-12** (see §6 tolerance rule) |
| S2 | Bootstrap CI reproducibility | byte-identical across processes for identical (input, seed, B) |
| S3 | First-viewport job | seeded dataset renders a full report card on first paint (0 interactions) |
| S4 | Heavy path — degradation contract (always on) | when the amber banner appears it shows the **documented reason** AND the point statistics remain identical to the non-degraded run (the test *degrades on purpose* and compares numbers; it never measures machine speed) |
| S5 | Privacy | default-path e2e: zero non-localhost requests; zero uncaught page errors |
| S6 | Initial page JS | ≤ 200 kB |
| S7 | Green gates | typecheck · lint · test · build · test:e2e all green locally **and** in CI in the fixed order |
| S8 | Coverage | functions ≥ 90%, lines/statements ≥ 80%, branches ≥ 70% scoped to `_lib` |
| S9 | Docs set | every file in BAR §8 present and in sync with the shipped code |
| S10 | Bar exit gate | all 18 items of BAR §10 pass with zero judgement calls |
| S11 | Wall-clock perf (gated) | under `PW_PERF=1` only, on the reference machine recorded in `PLAN.md` §1.6: 100k rows → report + CIs settled in ≤ 2.5 s with no frame gap > 100 ms and median ≥ 55 fps; 100k JSONL parse < 400 ms in node |

---

## 6. Quantified acceptance criteria — each backed by an automated test

Every criterion below names the suite that enforces it. No criterion is "verified by eye".

**Tolerance rule (adjudicated, applies to every criterion):** external reference values are
asserted to **±1e-12**; Judgewright's own outputs must be **bit-exact internally** — the
serialized payload is byte-comparable across runs at **17 significant digits** (`AC-13`,
`AC-55`). **No transcendentals**: `_lib/` contains no `Math.log/pow/exp/sqrt/sin/cos/atan`
(static check + lint rule, `AC-60`); every shipped number is +, −, ×, ÷ of doubles.

**Wall-clock rule (adjudicated):** criteria marked **(perf-gated)** run only when
`PW_PERF=1`, inside a non-blocking CI job on the reference machine documented in
`PLAN.md` §1.6; the default path keeps the relative/generous assertions only.

| ID | Criterion (quantified) | Enforced by |
|---|---|---|
| AC-01 | Cohen's κ on the canonical 2×2 example (`a=20,b=5,c=10,d=15`, p_o=0.70, p_e=0.50) equals **0.4 ± 1e-12** | `_lib/__tests__/cohensKappa.test.ts` |
| AC-02 | Cohen's κ on the hand-computed 2×2 (`a=12,b=3,c=2,d=3`, p_o=0.75, p_e=0.60) equals **0.375 ± 1e-12** | `cohensKappa.test.ts` |
| AC-03 | Perfect agreement ⇒ κ = **1** exactly; the constructed chance-agreement matrix ⇒ κ = **0** with \|κ\| ≤ 1e-15 | `cohensKappa.test.ts` |
| AC-04 | Multiclass κ on `human=[2,0,2,2,0,1]`, `judge=[0,0,2,2,0,2]` equals **0.4285714285714286 ± 1e-12** (independent oracle: scikit-learn's documented example, re-derived by hand) | `cohensKappa.test.ts` + `fixtures/oracle-kappa.json` |
| AC-05 | Weighted-linear κ = **0.5 ± 1e-12** and weighted-quadratic κ = **0.545454545454545 ± 1e-12** on the AC-04 data; on the 3-class fixture (`[[3,1,0],[1,2,0],[0,0,3]]`, rowTot=colTot=[4,3,3]) linear = **0.7777777777777778 ± 1e-12**, quadratic = **0.855072463768116 ± 1e-12**, unweighted = **0.6969696969696970 ± 1e-12** — all three cross-checked against scikit-learn; the weighted rows are labelled secondary and never feed the grade/deflation/CI (C1) | `cohensKappa.test.ts` |
| AC-06 | Krippendorff α **nominal** on the published worked example (3 coders × 15 units, n = 26 pairable) equals **0.691358024691358 ± 1e-12** (= 1 − 75/243; published value 0.691) | `krippendorffAlpha.test.ts` |
| AC-07 | Krippendorff α **interval** on the same data equals **0.8108448928121059 ± 1e-12** (= 1 − 12/63.44; published value 0.811) | `krippendorffAlpha.test.ts` |
| AC-08 | α = **1** for a perfectly agreeing panel; for binary values α_nominal ≡ α_ordinal bit-for-bit; α is `null` (never NaN, never 0) when fewer than 2 pairable values exist | `krippendorffAlpha.test.ts` |
| AC-09 | Chance baseline: always-majority agreement equals the largest human-label share ± 1e-12, and the baseline judge's `baselineKappa === 0` **exactly (≤ 1e-15) for randomly generated label sets at base rates 0.05, 0.10, …, 0.95, 0.99** — derived by `chanceBaseline` from the p_o = p_e identity (never by routing the constant dummy through `cohensKappa`, which returns `null` per AC-42) | `chanceBaseline.test.ts` |
| AC-10 | Δκ-deflation headline: on the 1,000-row binary fixture (920/30/20/30; human marginals 940/60, judge marginals 950/50) agreement = **0.95**, unweighted κ = **0.5192307692307692**, Δκ = **0.4307692307692308**, baseline = **0.94** — all ± 1e-12, and the rendered headline string contains all four numbers | `report.test.ts` + `reportRender.test.ts` |
| AC-11 | ECE (equal-width, 10 bins) on the hand fixture = **0.2 ± 1e-12** under the default `p-positive` mode; equal-frequency mode on the same fixture = **0.2**; ECE is `null` when scores are absent | `calibration.test.ts` |
| AC-12 | Brier on the hand fixture = **0.07999999999999999 ± 1e-12** under `p-positive`; `null` when scores absent | `calibration.test.ts` |
| AC-13 | Bootstrap reproducibility: for a fixed (rows, seed, B) the CI serialized to **17 significant digits** is **byte-identical across two in-process calls and across two separate node processes** — the cross-process half runs exactly `node --experimental-strip-types _lib/__tests__/repro.entry.ts` — and a different seed yields a different interval | `bootstrapCI.test.ts` (in-process) + `bootstrapCI.repro.test.ts` (spawns the pinned node command) |
| AC-14 | Parser: the fixture set covers JSONL happy path, CSV with quoted commas/newlines/CRLF, every alias group, ≥2-rater arrays, the **10-row parse decision table of §2.1.8** with each row's exact copy, and **all six error classes** (`structure`, `missing-field`, `bad-value`, `vocabulary`, `capacity`, `ambiguity`) — each error asserts an **exact line number, class and reason string** | `parse.test.ts` |
| AC-15 | Parser throughput. **(a) default (always runs):** parsing 200,000 JSONL rows takes **< 8×** the wall time of parsing 20,000 rows (relative regression guard, node). **(b) perf-gated (`PW_PERF=1`, reference machine):** 100,000 JSONL rows parse in **< 400 ms** in node (wall clock, measured in the test, generous bound) | `parse.perf.test.ts` |
| AC-16 | Disagreement table renders via a virtualised window: a 250-row seeded fixture attaches **250 `tbody tr`** elements (the "250 of 250" strip shows); a 5,000-row fixture attaches exactly **2,000 `tbody tr`** plus the honest "showing 2,000 of 5,000" strip, and the scroll container stays one viewport tall (only layout-agnostic `tbody tr` counts are asserted — never pixel positions) | `e2e/disagreements.spec.ts` |
| AC-17 | **LLM no-op without a key**: with an injected fake `fetch` spy, zero calls are made, the panel reports the configure-key state, and no store field is written | `llmDiagnosis.test.ts` |
| AC-18 | **LLM flow with a fake fetch**: exactly **one** call is made to `https://openrouter.ai/api/v1/chat/completions` with the contract body shape — rubric + **25 rows** selected round-robin across distinct confusion cells, each row carrying `id`, `input`, `output`, `human_label`, `human_critique?`, `judge_label`, `judge_critique?`; a conforming reply renders 4 sections; nonconforming JSON raises a typed `DiagnosisFormatError`; a 500 raises `DiagnosisNetworkError`; the API key and the entire request body never appear in **any store snapshot at any point in the flow**, `console`, or `localStorage` | `llmDiagnosis.test.ts` |
| AC-19 | No main-thread freeze at 100k rows. **(a) default (always runs):** the benchmark dataset control produces a full, correct report (all point statistics equal the reference values) through the real worker, with zero uncaught page errors and a generous 30 s wall bound — no frame-rate or absolute-time assertion. **(b) perf-gated (`PW_PERF=1`, reference machine):** ≤ 2.5 s wall clock with a `requestAnimationFrame` frame-gap probe recording **no frame gap above 100 ms** and median ≥ 55 fps throughout | `e2e/perf.spec.ts` |
| AC-20 | **Zero egress by default**: (1) the Playwright request guard sees only `localhost`/`127.0.0.1` hostnames and zero uncaught page errors; (2) a **static** assertion parses the shipped CSP and requires every `connect-src` origin to appear in the documented `DECLARED_ORIGINS` list, and the runtime-observed origins to be a subset of it — the e2e env pins Supabase keys **empty** in `playwright.config.ts` so no Supabase origin is ever observed | `e2e/smoke.spec.ts` + `e2e/visual.spec.ts` + `csp.test.ts` (static) |
| AC-21 | Layout contract: exactly one `<h1>`, `header/main/footer` landmarks, skip link to `#workstation`, **no horizontal overflow at 390px and 1440px** (`scrollWidth <= innerWidth + 2`), two-pane stacks below `lg` — with exact class assertions: `main` carries **no `max-w-*` class**, the workstation grid carries `lg:h-[620px]` and `lg:grid-cols-2` | `e2e/visual.spec.ts` |
| AC-22 | Design-system conformance: a catalog test asserts every control in the UI kit carries the five-state utilities (`active:scale-[0.97]`, `focus-visible:ring-brand-lime/…`, `disabled:opacity-50`, `duration-150 ease-out-expo`, `motion-reduce:transition-none`) and that no component uses a raw named palette | `_components/__tests__/uikit.test.ts` |
| AC-23 | Seeded first run: the default dataset produces **≥ 2 agreements and a letter grade on first paint** with zero interaction; the first-run seed is guarded by the preset suite | `presets.test.ts` + `e2e/smoke.spec.ts` |
| AC-24 | Store split: only `{ rubric, verdicts, settings }` persist under `judgewright-tool-storage` (version 1) — `settings` = `{ seed, confidenceLevel, kappaWeights, judgeScoreMode, positiveClass, labelOrder, alphaLevel, bins, binMode }`; the LLM key, report, metrics, worker state and announcements are transient; the theme key `judgewright-theme` is never merged in | `useToolStore.test.ts` |
| AC-25 | Coverage gates: `functions ≥ 90`, `lines/statements ≥ 80`, `branches ≥ 70` scoped to the pure core — green in CI | `vitest.config.mts` + CI |
| AC-26 | Grade mapping is deterministic and documented, **applied to unweighted κ only**: boundary table drives 0.7999→B, 0.80→A, 0.60→B, 0.40→C, 0.20→D, 0.1999→F, `null`→"—"; each letter is asserted to carry its Landis–Koch label (A "almost perfect", B "substantial", C "moderate", D "fair", F "slight"); κ < 0 ⇒ "F" / "worse than chance" (AC-57) | `grade.test.ts` |
| AC-27 | Worker contract: a synthetic 200k-row dispatch settles with tiered `B` (500) and the report carries `bootstrapReplicates = 500`; the watchdog path is unit-tested with a fake timer that fires at 1,500 ms and asserts terminate + respawn + a friendly message (crash paths are AC-31) | `useJudgewrightWorker.test.ts` |
| AC-28 | Form-agnostic statistics: the report is **identical whether the input arrived as JSONL or CSV** for the same logical rows (byte-equal after normalization) | `report.test.ts` |
| AC-29 | **FM-4 κ undefined**: on the degenerate fixtures of AC-42 the report has `kappa === null`, `grade === "—"`, `deflation === null`, `ci.kappa === null`, and the headline shows the reason; the panel copy is verbatim *"κ is undefined: no label variance to correct for. Report accuracy instead."* | `report.test.ts` + `reportRender.test.ts` |
| AC-30 | **FM-5 row cap**: a 200,001-row fixture yields `truncated === true`, `rowCount === 200001`, `n === 200000`, the amber strip *"Results capped at 200,000 of 200,001 rows."*, and the JSONL export carries exactly the 200,000 analyzed rows | `report.test.ts` + `parse.test.ts` |
| AC-31 | **FM-6 worker crash ⇒ degrade**: a fake worker whose handlers fire `onerror` and `onmessageerror` (not just the watchdog) funnels through `degradeToMainThread()` — respawn attempted exactly once, `isWorkerAvailable` goes `false`, the report is flagged `degraded: true`, the banner shows *"Worker unavailable — computing on the main thread (same core, CIs capped)."*, and the point statistics are **equal** to the worker-path numbers for the same input | `useJudgewrightWorker.test.ts` |
| AC-32 | **FM-7 bootstrap deadline trips**: with the worker deadline forced to ~0 via the injected clock, phase-A statistics are unchanged (byte-equal to the non-degraded run), `ci.accuracy/kappa/alpha === null`, the copy *"Bootstrap CIs omitted — the deadline was reached. Point statistics are unaffected."* is asserted, and the receipt names the deadline (AC-52) | `report.test.ts` + `useJudgewrightWorker.test.ts` |
| AC-33 | **FM-11 empty input ⇒ demo seed**: text that trims to empty loads the seeded demo dataset; the store settles a real report and the banner shows *"Loaded the demo dataset — paste your own verdicts to replace it."* | `presets.test.ts` + `useJudgewrightWorker.test.ts` |
| AC-34 | **FM-14 single critic**: with exactly one human rater everywhere, `alphaPanel` is computed over `[judge, human]`, `alphaHumans === null`, and the panel shows *"Human ceiling needs ≥2 human raters per example."* — plus the mandatory 2-coder disclosure of AC-50 | `krippendorffAlpha.test.ts` + `report.test.ts` |
| AC-35 | **All rows invalid ⇒ report is `null`, never zero-filled**: non-empty input in which every row fails validation settles with `report === null`, `errorMessage` set to *"No usable rows — every row failed validation. Fix the first issue and try again."*, and the first 5 issues listed; no store field contains a fabricated report | `useJudgewrightWorker.test.ts` + `report.test.ts` |
| AC-36 | **Duplicate `example_id` ⇒ rows stay independent**: a fixture with 2 rows sharing an id yields `n` counting both rows, a warning listing the duplicated id, and the receipt/parse note *"duplicate example_id "X42" — rows are counted independently"* | `parse.test.ts` + `report.test.ts` |
| AC-37 | **`judge_score` outside [0,1] ⇒ absent, never clamped**: a row with `judge_score 1.7` produces the issue *"line 17: judge_score 1.7 is outside [0,1] — treated as absent, never clamped"*, the row's `judgeScore === null`, `calibration.scoreCount` excludes it, and no other value in the report changes | `parse.test.ts` + `calibration.test.ts` |
| AC-38 | **LLM aborted mid-flight**: an in-flight fetch rejecting with `AbortError` yields `DiagnosisError` with `kind === "aborted"`, the copy *"Diagnosis aborted — nothing was sent or stored."*, and `diagnosisState === "configure-key"` (key still in memory, never persisted) | `llmDiagnosis.test.ts` + `useToolStore.test.ts` |
| AC-39 | **C1 — unweighted κ is the headline**: with default options (`kappaWeights` may be anything; the default is `"unweighted"`) on the adjacent-error fixture (16 rows over ordered classes `1<2<3`: 4× (human 1, judge 1), 1× (human 2, judge 1), 1× (human 3, judge 2), 10× (human 3, judge 3) — every error off-by-one adjacent): accuracy = **0.875**, unweighted κ = **0.744**, weighted-linear κ = **0.8545454545454545**, weighted-quadratic κ = **0.9219512195121952**, and the **headline deflation = 0.131 ± 1e-12**; `grade === letterGrade(unweighted κ) === "B"` (linear κ would grade "A" — the headline must not use it), and the secondary row renders the weighted values labelled secondary | `report.test.ts` + `reportRender.test.ts` |
| AC-40 | **C2 — mode semantics are observable**: on the calibration hand fixture the same rows yield ECE = **0.2 ± 1e-12** under `p-positive` and **0.16 ± 1e-12** under `confidence`, and Brier = **0.07999999999999999 ± 1e-12** vs **0.04 ± 1e-12**; the panel prints the selected mode | `calibration.test.ts` |
| AC-41 | **C2 — mismatch detector**: on a fixture whose scores are confidences mislabelled as probabilities (10 rows, `judge_score = 0.6` on every row, judge label negative while the human label is positive), the absolute difference between the two modes’ ECE is **0.2 ± 1e-12 (> the 0.05 threshold)** and the panel surfaces verbatim *"your scores look like confidences, not probabilities"* with a one-click switch to `confidence` | `calibration.test.ts` + `reportRender.test.ts` |
| AC-42 | **C3 — single κ guard**: `cohensKappa` returns `null` **before either path** when the raters are degenerate (a rater with a single distinct label — which includes the `S === n²` 0/0 case): `human=[PASS,PASS], judge=[PASS,PASS]` ⇒ `κ === null` **and** `kappaUndefinedReason(...) !== null` **and** `letterGrade(null) === "—"`; `human=[PASS,PASS], judge=[PASS,FAIL]` ⇒ `null` | `cohensKappa.test.ts` + `grade.test.ts` |
| AC-43 | **C4 — interval α needs numeric labels**: on `[PASS, FAIL]` units, interval α returns `null` with the reason *"interval α needs numeric labels; use nominal"* | `krippendorffAlpha.test.ts` |
| AC-44 | **C4 — interval α on numeric labels**: on the ordinal/interval fixture (6 units × 2 coders over ordered classes `1<2<3`: 3× `[1,1]` then 3× `[2,3]`), interval α = **0.6666666666666666 ± 1e-12** | `krippendorffAlpha.test.ts` |
| AC-45 | **C4 — ordinal α**: on the same fixture, ordinal α = **0.7962962962962963 ± 1e-12** and is **invariant under order-preserving relabels** — labels `{1,2,3}`, `{10,20,30}` and `{LOW,MID,HIGH}` with `labelOrder: ["LOW","MID","HIGH"]` all return the identical value; on non-numeric labels **without** `labelOrder` the result is the nominal value (**0.2666666666666666 ± 1e-12**) plus the warning *"ordinal α needs numeric labels or an explicit labelOrder — falling back to nominal"* (never a silent alphabetical sort order) | `krippendorffAlpha.test.ts` |
| AC-46 | **C5 — unknown-but-consistent labels are valid**: `{GOOD, OK, BAD}` on both columns yields a full 3-class report (3×3 matrix, TPR/TNR/PPV/F1 per label, macro metrics, a letter grade) — no error, no fallback | `report.test.ts` + `parse.test.ts` |
| AC-47 | **C5 — mixed known families are a hard error**: `{PASS, FAIL, TRUE}` yields no report and the verbatim copy *"Labels {PASS, FAIL, TRUE} mix two vocabularies — normalize before comparing. Known aliases: pass/fail, yes/no, true/false, 1/0."* | `parse.test.ts` |
| AC-48 | **C5 — numeric/family collision is a hard error**: `{PASS, FAIL, 1}` yields no report (two known families) | `parse.test.ts` |
| AC-49 | **M1 — index resampling**: `bootstrapCI(rows, stat, opts)` draws **row indices with replacement over examples** — with B = 2,000 replicates over n = 10 rows every row's selection count is within ±3 SD of B/n, and on a 95/5 label-split fixture the mean resampled accuracy stays within 0.02 of the full-sample accuracy (a label-resampling implementation would show ≈ 0.5); the **permuted-label control** — the AC-10 fixture with the judge column rotated by 500 positions — yields κ̂ = **−0.0576923076923077 ± 1e-12** and a 95% percentile CI that **contains 0** | `bootstrapCI.test.ts` |
| AC-50 | **M5 — α disclosures + κ/α pinned on the same fixture**: on the AC-10 fixture, unweighted κ = **0.5192307692307692 ± 1e-12** and α_nominal over the panel `[judge, human]` = **0.5192400192400193 ± 1e-12** (the ≈ 9.3e-6 difference is intentional and visible); the α panel markup contains verbatim *"with one human rater the panel is 2 coders, so this is Krippendorff's α (a chance-corrected coefficient), not Cohen's κ; the two differ by construction"* and labels its letter *"κ-bands applied to α for comparability — not α's own convention"* | `krippendorffAlpha.test.ts` + `reportRender.test.ts` |
| AC-51 | **M6 — positive class is explicit and switchable**: `positiveClass` defaults to the second sorted label and is settable via `ComputeOptions` and the one-click labelled toolbar control; on the 2×2 fixture (human ACCEPTED/REJECTED 25/25, matrix `[[20,5],[10,15]]`) the default (`REJECTED`) yields TPR = **0.6** and PPV = **0.75**, and setting `positiveClass: "ACCEPTED"` yields TPR = **0.8** and PPV = **0.6666666666666666**; the confusion-matrix header and the receipt both print the positive class | `confusionMatrix.test.ts` + `reportRender.test.ts` |
| AC-52 | **M12 — receipt fields**: every rendered receipt contains `{seed, B, deadlineMs, ciDropped, reason, engine}` with the live values (engine ∈ `worker`/`main-thread`); on a deadline-tripped report (AC-32) the receipt **names the deadline**, states that CIs were omitted, and still reports `bootstrapReplicates` = the tier (**500** at 200k rows) | `reportRender.test.ts` + `report.test.ts` |
| AC-53 | **M14 — tier boundaries + disclosure**: `bootstrapTier(50000) === 2000`, `bootstrapTier(50001) === 1000`, and the whole table is asserted **monotonic non-increasing**; the CI panel names the tier rule with the verbatim copy *"B = 500 (tiered for ≤200k rows; a smaller dataset would get B = 2000)"* (numbers substituted from the actual tier) | `bootstrapCI.test.ts` + `reportRender.test.ts` |
| AC-54 | **M7 — copy path + toast semantics**: `⌘⇧C` copies the current output (clipboard content read back through a Playwright-granted permission) and shows the brand-lime success toast; with the Clipboard API forced unavailable the hidden-textarea `execCommand` fallback still copies and still toasts lime; a forced copy failure shows the rose toast with its failure copy; `⌘K`, `⌘P` and `⌘↵` are asserted to open the palette, open the preset menu, and focus the primary input respectively | `e2e/copy.spec.ts` + `_components/__tests__/toaster.test.tsx` |
| AC-55 | **m3 — 17-sig-fig payload + one canonical one-line verdict golden**: the serialized numeric payload round-trips at 17 significant digits (byte-comparable), and `renderOneLineVerdict` on the AC-10 report matches the checked-in golden byte-for-byte (`_lib/__tests__/reportRender.golden.txt`), whose grade token is `B`, κ token `0.51923076923076923`, accuracy token `95.0%` and baseline token `94.0%`; the golden is regenerable only via `npm run golden:one-liner` | `bootstrapCI.repro.test.ts` + `reportRender.test.ts` |
| AC-56 | **m13 — cited, not computed**: a content test greps every user-facing string source (`_lib/guide.ts`, `_lib/faq.ts`, `_components/CompetitorMatrix.tsx` and any `_content/**`) and requires every string containing a digit to also carry a source link (`https://`) or a `{cite: "…"}` tag and the words *cited, not computed by this tool*; an arXiv ID may appear in user-facing copy only after its resolution is recorded (URL + fetch date) in `QUALITY_REPORT.md` at the **Phase-4 gate**, otherwise the copy is attribution-only | `content.test.ts` + `QUALITY_REPORT.md` (Phase 4) |
| AC-57 | **m1/m2 — negative κ is named, not rounded**: κ = −0.01 ⇒ grade `"F"` with label `"worse than chance"`; a report with κ < 0 renders *"κ is negative — the judge disagrees systematically"* in place of the pp-deflation figure | `grade.test.ts` + `reportRender.test.ts` |
| AC-58 | **M8 — canonical origin wiring**: `metadataBase` resolves from `NEXT_PUBLIC_SITE_URL` (an env-override test boots with a different origin and asserts the metadata follows), and the rendered `sitemap.xml` and `robots.txt` share that same origin; `.env.example` is the authoritative source (`NEXT_PUBLIC_SITE_URL=https://judge.norai.tech`) | `seo.test.ts` + `e2e/smoke.spec.ts` |
| AC-59 | **M2 — summary/window payload + 200k frame-gap probe (perf-gated `PW_PERF=1`)**: at 200,000 rows with a judge critique on every row, the worker posts **one** payload whose `disagreements` window is ≤ `MAX_TABLE_ROWS` while `totalCount === 200000` (asserted with a page-side `postMessage` spy), the full set is only pulled on demand for export/LLM, and a `requestAnimationFrame` probe records no frame gap > 100 ms with median ≥ 55 fps | `e2e/perf.spec.ts` + `useJudgewrightWorker.test.ts` |
| AC-60 | **m8 — no transcendentals**: a static test plus an eslint `no-restricted-properties` rule (blocking `Math.log/pow/exp/sqrt/sin/cos/atan` under `_lib/**`) fails the build if any transcendental appears in `_lib/`, and the receipt prints the note *"no transcendentals: every value above is +, −, ×, ÷ of doubles"* | `_lib/__tests__/purity.test.ts` + `eslint.config.mjs` |
| AC-61 | **C6 — measured α bootstrap inside the deadline (perf-gated `PW_PERF=1`)**: on the reference machine recorded in `PLAN.md` §1.8, the shared resample loop (one RNG stream, one index array per replicate updating accuracy + κ + α together) completes the α bootstrap at 200,000 rows with the tier `B` (and `alphaReplicates` disclosed when the α-specific tier applies) inside `WORKER_DEADLINE_MS` (1,000 ms) in node; the measured numbers are recorded in `PLAN.md` §1.8 **and** `BENCHMARKS.md`; the escape hatch is documented — on a machine ≥ 2.5× slower the FM-7 deadline abort may drop CIs (disclosed in the receipt), and no number is ever changed to fit the clock | `bootstrapCI.test.ts` (timed) + `BENCHMARKS.md` |
