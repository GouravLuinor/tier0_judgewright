# Judgewright benchmarks

Every number below was **measured for real** on the reference box, by running the shipped code,
with `npm run bench`. Nothing here is aspirational, and no number is extrapolated: the table is
a transcript of that command's output for the run recorded on **2026-10-11**, and the
reproduce command is at the bottom so any figure can be re-derived.

## Machine & method

| | |
|---|---|
| CPU | 13th Gen Intel Core i7-13620H · `nproc` = 12 · `os.cpus().length` = 12 |
| RAM | 6.8 GiB |
| OS | Linux, WSL2, kernel `6.6.87.2-microsoft-standard-WSL2` |
| Node | **v24.13.0** · npm 11.8.0 · tsx 4.23.15 |
| Runner | `scripts/bench.ts` via `tsx` — no bundler, no browser, no worker harness |
| Samples | median of **n** samples, one untimed warm-up per measurement; p95 = nearest-rank 95th percentile of the same samples |
| Seed | 42 (the default), confidence level 0.95 |

Two payload widths are measured because row cost depends on row width:

- **wide** — `example_id` + `judge_label` + `human_label` + `judge_score` + both critiques,
  ≈ **195 chars/row**. This is the critique-bearing session the caps table describes.
- **narrow** — `example_id` + both labels, ≈ **68 chars/row**. This is the shape in which the
  full 200,000-row `MAX_ROWS` fits most comfortably.

Each row of the table reports the tier the row count actually selects (`B` and `alphaB` from
`bootstrapTier` / `alphaBootstrapTier`) and the **watchdog tier for that payload's character
count** (`watchdogMsFor`) — a function of characters, not rows.

## Full dispatch — `analyzeVerdicts`, exactly as the Web Worker calls it

The worker issues `analyzeVerdicts(text, { deadlineMs: WORKER_DEADLINE_MS, engine: "worker",
seed, confidenceLevel, … })`. `deadlineMs` is 1,000 ms and the budget is an **absolute**
timestamp taken *before* the parse, so the parse is inside the budget. The last column is the
same pipeline with the budget lifted to 60 s, which shows the unconstrained cost of a settled
report.

### Wide payload (≈195 chars/row)

| Rows | Chars | B | αB | Watchdog | n | Median | p95 | Median (budget lifted) | CIs dropped |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 188,669 | 2,000 | 2,000 | 3,000 ms | 11 | **16.19 ms** | 21.60 ms | 11.88 ms | 0/11 |
| 20,000 | 3,866,669 | 2,000 | 2,000 | 8,000 ms | 9 | **222.22 ms** | 231.13 ms | 224.18 ms | 0/9 |
| 50,000 | 9,716,669 | 2,000 | 2,000 | 8,000 ms | 9 | **588.82 ms** | 630.61 ms | 560.82 ms | 0/9 |
| 100,000 | 19,466,669 | 1,000 | 250 | 8,000 ms | 9 | **859.87 ms** | 961.21 ms | 830.72 ms | 0/9 |
| 150,000 | 29,366,669 | 500 | 250 | 8,000 ms | 7 | **997.44 ms** | 1,122.42 ms | 1,023.86 ms | **1/7** |
| 200,000 | 39,266,669 | 500 | 250 | 8,000 ms | 7 | **1,328.82 ms** | 1,488.48 ms | 1,436.66 ms | **7/7** |

### Narrow payload (≈68 chars/row)

| Rows | Chars | B | αB | Watchdog | n | Median | p95 | Median (budget lifted) | CIs dropped |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 65,889 | 2,000 | 2,000 | 3,000 ms | 11 | **9.81 ms** | 13.25 ms | 9.89 ms | 0/11 |
| 20,000 | 1,348,889 | 2,000 | 2,000 | 5,000 ms | 9 | **183.25 ms** | 188.11 ms | 183.08 ms | 0/9 |
| 50,000 | 3,388,889 | 2,000 | 2,000 | 8,000 ms | 9 | **473.40 ms** | 478.26 ms | 499.51 ms | 0/9 |
| 100,000 | 6,788,889 | 1,000 | 250 | 8,000 ms | 9 | **613.03 ms** | 676.98 ms | 626.34 ms | 0/9 |
| 150,000 | 10,238,889 | 500 | 250 | 8,000 ms | 7 | **747.51 ms** | 790.35 ms | 756.99 ms | **1/7** |
| 200,000 | 13,688,889 | 500 | 250 | 8,000 ms | 7 | **1,019.80 ms** | 1,052.96 ms | 1,006.36 ms | 0/7 |

## The 200k reality — a dispatch settles; the CIs are what the budget buys

This is the part worth reading carefully, because two different budgets are in play and they
are not the same budget.

- The **watchdog** is a hard wall against an unkillable hang. It is **tiered by payload size**
  (`watchdogMsFor`): `≤20,000 chars → 1,500 ms` · `≤200,000 → 3,000 ms` · `≤2,000,000 → 5,000 ms`
  · above → `8,000 ms`. Both 200k payloads above (13.7 MB and 39.3 MB) land in the 8,000 ms tier.
- The **cooperative budget** is 1,000 ms (`WORKER_DEADLINE_MS`), checked at phase boundaries
  and every 128 bootstrap replicates. A trip **drops the CIs** and names it (`ciDropped`);
  it never changes a point statistic, `B` or the baseline.

So at 200,000 rows:

1. **The dispatch always settles.** Measured median 1,020 ms (narrow) and 1,329 ms (wide)
   against an 8,000 ms watchdog tier — 7.8× and 6.0× of headroom. The `e2e/perf.spec.ts` journey
   *"A2: a 200k dispatch settles a report — never an abort"* proves it in the real browser and
   accepts either CI outcome by design.
2. **The 1,000 ms cooperative budget is exceeded** at that size, by a run-dependent margin:
   narrow/200k lands **1.1% to 8.0% over** the budget across the four runs on this box
   (1,011.24 ms–1,080.21 ms; 1,019.80 ms in this run), wide/200k further over at **32.9%**
   (1,328.82 ms) in this run, and whether the CIs survive varies with the run — 6/7, 2/7, 0/7
   and 0/7 dropped on narrow/200k across those four runs. At wide/200k the budget trips and the
   CIs are dropped in **7 of 7** runs; the point statistics, the grade, the Δκ deflation and
   the receipt are unaffected and the copy says the CIs were omitted.
3. **The narrow/200k row is the interesting boundary.** Its median in this run (1,019.80 ms)
   is 2.0% over the budget, yet the CIs survived 7 of 7 runs — because the deadline is only
   re-checked every 128 replicates, and at `B = 500` the run finished between checks. This is
   the one row in the table whose outcome is a **distribution rather than a constant**: across
   four runs of `npm run bench` on this box, the narrow/200k budgeted dispatch measured
   **1,080.21 ms with CIs dropped in 6 of 7 runs**, **1,071.78 ms with 2 of 7**,
   **1,011.24 ms with 0 of 7**, and **1,019.80 ms with 0 of 7** (this run). **The honest
   statement is that the narrow-200k dispatch sits on the budget boundary, not comfortably
   inside it.**
4. At 150,000 wide rows the four runs measured **1,272.88 ms (CIs dropped 4/7)**,
   **1,206.07 ms (1/7)**, **1,120.57 ms (0/7)** and this run's **997.44 ms (1/7)**; at 100,000
   wide rows they measured 938.11 ms (0/9), 1,131.20 ms (4/9), 872.96 ms (0/9) and this run's
   859.87 ms (0/9). Same effect: the deadline is a sampling, not a wall, so near the boundary
   the outcome varies with the run. What does *not* vary is that a trip drops CIs only — the
   point statistics, the grade and the receipt settle identically every time, and
   `e2e/perf.spec.ts` asserts the 200k dispatch always settles.

**Absolute numbers on a shared, virtualized box move by a few percent between runs.** The
tier table, the watchdog tiers, `B`, `alphaB` and every determinism guarantee below are exact
and reproducible; the milliseconds are not.

## Phase breakdown

The same runs, broken into what `scripts/bench.ts` measures separately: parse alone, Phase A
(point statistics, measured with an already-expired budget so the bootstrap is skipped), and
the κ+α bootstrap bundle alone at the tier the row count selects.

### Wide payload (≈195 chars/row)

| Rows | Parse median | p95 | Point stats median | p95 | κ+α bundle median | p95 |
|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 2.97 ms | 71.47 ms | 1.20 ms | 3.14 ms | 7.16 ms | 13.48 ms |
| 20,000 | 69.43 ms | 112.59 ms | 13.38 ms | 20.60 ms | 128.32 ms | 137.80 ms |
| 50,000 | 157.06 ms | 205.13 ms | 42.02 ms | 44.29 ms | 319.29 ms | 327.85 ms |
| 100,000 | 325.87 ms | 409.56 ms | 108.71 ms | 196.50 ms | 336.03 ms | 350.48 ms |
| 150,000 | 482.84 ms | 540.86 ms | 130.63 ms | 198.34 ms | 252.27 ms | 263.87 ms |
| 200,000 | 621.01 ms | 725.32 ms | 180.75 ms | 294.41 ms | 343.13 ms | 356.13 ms |

### Narrow payload (≈68 chars/row)

| Rows | Parse median | p95 | Point stats median | p95 | κ+α bundle median | p95 |
|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 2.05 ms | 3.22 ms | 0.89 ms | 1.10 ms | 7.00 ms | 8.70 ms |
| 20,000 | 44.28 ms | 49.98 ms | 10.63 ms | 19.57 ms | 125.10 ms | 129.22 ms |
| 50,000 | 106.52 ms | 114.02 ms | 33.93 ms | 85.56 ms | 322.00 ms | 329.04 ms |
| 100,000 | 231.30 ms | 243.37 ms | 70.54 ms | 105.57 ms | 323.94 ms | 327.36 ms |
| 150,000 | 336.83 ms | 390.64 ms | 118.57 ms | 196.08 ms | 254.48 ms | 257.31 ms |
| 200,000 | 450.69 ms | 516.59 ms | 155.79 ms | 200.88 ms | 356.79 ms | 362.43 ms |

Three facts this breakdown establishes:

- **The parse is the dominant cost at scale**, not the statistics. At wide/200k the parse is
  621 ms of a 1,329 ms dispatch (47%); at narrow/100k it is 231 ms of 613 ms (38%). That is why
  `parseVerdicts` is allocation-conscious and why the character cap is a budget, not decoration.
- **Phase A (every point statistic: confusion, TPR/TNR/precision/recall/F1, unweighted and
  weighted κ, α at all three levels, the baseline, the grade, the deflation, the receipt and
  the per-example rows) is 0.9–181 ms** across the whole range — cheap, and always run.
- **α shares the κ resample, so it has no separate bill.** The bundle measured above already
  includes α at its replicate tier (`alphaB` in the table). `bootstrapBundle` drives accuracy,
  κ and α from **one** index draw and **one** fused accumulate pass, each statistic derived
  from the replicate's class-pair counts — so α never rebuilds a coincidence matrix per
  replicate. The tests that guard this design are the determinism pair
  ("the same rows and the same seed produce byte-identical CIs" / "different seeds produce
  different CIs"), the α tier rule ("applies min(B, 250) for α above 50,000 rows") and the
  AC-53 verbatim tier copy. **This run does not produce a κ-only bundle**, so no difference
  figure is quoted for it: a κ-only call is a different code path, not a subset of the one
  measured here, and quoting an unmeasured delta would be exactly the kind of number this file
  exists to refuse.

## The bootstrap tier table

`B` is a **pure function of the row count**, never of wall-clock time, so the same rows always
produce the same `B` and therefore byte-identical CIs:

| Rows | B (κ, accuracy) | α replicates |
|---|---:|---:|
| ≤ 50,000 | 2,000 | 2,000 |
| ≤ 100,000 | 1,000 | 250 |
| ≤ 150,000 | 500 | 250 |
| ≤ 200,000 | 500 | 250 |

The disclosed copy is verbatim: for 200,000 rows the receipt prints
`B = 500 (tiered for ≤200k rows; a smaller dataset would get B = 2000)`, and the report carries
both `alphaReplicates` (the budget the rule applied) and `alphaBootstrapReplicates` (the count
the α CI really consumed), so the rule is visible rather than inferred.

## Capacity — the two caps multiply

`MAX_ROWS = 200,000` and `MAX_INPUT_CHARS = 40,000,000` cannot both bind. The probe at the top
of every `npm run bench` run measures the payload's real row width and reports the ceiling:

```
## capacity (A16) — wide payload measures 188.7 chars/row, so the
40,000,000-character ceiling allows 212,011 rows while MAX_ROWS allows 200,000;
the binding limit is 200,000 rows
  200,000 wide rows = 39,266,669 chars → settles a report (n=200000)
```

For the bench's 188.7 chars/row payload the character ceiling (212,011 rows) is above the row
cap, so 200,000 wide rows fit and settle. The **ceiling is a property of the user's data, not a
constant**: `floor(40,000,000 ÷ chars-per-row)`.

- at the **~205 chars/row** a critique-bearing session is documented to cost, the ceiling is
  ≈ 195,000 rows;
- at 226.7 chars/row (critique text one clause longer) it is **176,468 rows** — a 200,000-row
  paste of that shape is rejected before parsing with its true size named
  (`Input is 46,866,669 characters — the limit is 40,000,000.`), never silently truncated.

So the honest headline is: **≈190,000 critique-bearing rows**, with the exact number a property
of row width. `MAX_ROWS` still counts and discloses the true total when a paste is capped.

## Determinism — cross-process digests

`B` is a pure function of the row count and the RNG is one `mulberry32` stream seeded from
settings, so the same input reproduces byte-identical CIs in this process and in any other. The
proof is a command, not an assertion: both entries below exit 0 only if the same input
reproduces itself and a different input/seed produces a *different* digest.

```bash
$ npm run repro:seed          # node --experimental-strip-types _lib/__tests__/repro.entry.ts
REPRO seed=42 0.94999999999999996/0.93600000000000005/0.96399999999999997 0.51923076923076927/0.39718157858473968/0.62811512020133808 0.51924001924001928/0.39638468506737767/0.62824021204098945 points=0.51923076923076927/0.51924001924001928
REPRO seed=42 0.94999999999999996/0.93600000000000005/0.96399999999999997 0.51923076923076927/0.39718157858473968/0.62811512020133808 0.51924001924001928/0.39638468506737767/0.62824021204098945 points=0.51923076923076927/0.51924001924001928
REPRO seed=7 0.94999999999999996/0.93500000000000005/0.96299999999999997 0.51923076923076927/0.39622967208067250/0.62791444375053607 0.51924001924001928/0.39635755776035581/0.62798498486230825 points=0.51923076923076927/0.51924001924001928
```

Two separate processes printed the `seed=42` line byte-for-byte identically; `seed=7` differs,
which is what rules out a constant. The full pipeline does the same:

```bash
$ npm run repro:analyze      # node --experimental-strip-types _lib/__tests__/repro.analyze.entry.ts
REPRO-ANALYZE n=1000 acc=0.94999999999999996 kappa=0.51923076923076927 kappaLinear=0.51923076923076916 kappaQuadratic=0.51923076923076916 deflation=0.43076923076923068 alphaPanel=0.51924001924001928 baseline=0.93999999999999995 ciAccuracy=0.94999999999999996/0.93600000000000005/0.96399999999999997 ciKappa=0.51923076923076927/0.39718157858473974/0.62811512020133808 ciAlpha=0.51924001924001928/0.39638468506737767/0.62824021204098945 B=2000 alphaReplicates=2000 grade=C chars=60999 bytes=60999
```

The second session (a deliberately different 500-row fixture, so the digests must differ):

```
REPRO-ANALYZE n=500 acc=0.0000000000000000 kappa=-1.0000000000000000 kappaLinear=-1.0000000000000000 kappaQuadratic=-1.0000000000000000 deflation=1.0000000000000000 alphaPanel=-0.99800000000000000 baseline=0.50000000000000000 ciAccuracy=0.0000000000000000/0.0000000000000000/0.0000000000000000 ciKappa=-1.0000000000000000/-1.0000000000000000/-0.98019801980198018 ciAlpha=-0.99800000000000000/-0.99800000000000000/-0.99800000000000000 B=2000 alphaReplicates=2000 grade=F chars=32999 bytes=32999
```

The digest covers `n`, accuracy, all three κ rows, the deflation, panel α, the baseline, all
three CI triples at 17 significant digits, `B`, the α replicate count, the grade and the byte
count — printed three times (twice for the same input, once for a second session) and verified
identical in-process, and identical again when the command is re-run in a new process.

## Reproduce

```bash
# the timings and the capacity probe in this file
npm run bench                     # tsx scripts/bench.ts — about 3 minutes on the reference box

# the determinism digests above, in a fresh process
npm run repro:seed                # seeded CI digest
npm run repro:analyze             # full settled-report digest

# the gates, in CI order
npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e
```

`scripts/bench.ts` drives the real `_lib` modules the app imports (`parseVerdicts`,
`computeReport`, `bootstrapBundle`, `analyzeVerdicts`) with no bundler and no browser, so a
number in this file cannot drift from the code that ships.
