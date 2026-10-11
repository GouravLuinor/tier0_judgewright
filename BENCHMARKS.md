# Judgewright benchmarks

Every number below was measured for real, on the reference box (Node v24.13.0, WSL2,
`vitest run --coverage` and the Playwright webServer boot). Commands are recorded so any of them
can be re-run. These are *scaffold* measurements — the statistics milestone replaces the
time-series numbers with the parser / matrix / κ / bootstrap numbers.

## Pure core throughput (`_lib/analyze.ts`)

Measured by driving `analyzeVerdicts()` directly with a synthetic JSONL payload of realistic
row width (id + two labels + two critiques ≈ 170 bytes/row), median of 5 runs:

| Rows | Characters | Median | Min | Max |
|---|---|---|---|---|
| 1,000 | 169,669 | **0.82 ms** | 0.49 ms | 1.66 ms |
| 20,000 | 3,486,669 | **14.89 ms** | 12.29 ms | 28.88 ms |
| 200,000 (`MAX_ROWS`) | 35,466,669 | **259.75 ms** | 183.33 ms | 309.36 ms |

The cap ceiling (35 MB) is reached at roughly `MAX_ROWS * 178 bytes` — the two limits stay at
the same order of magnitude, which is the intent of the cap table in `_lib/constants.ts`.

## Statistics core — parse + report + seeded bootstrap (D2, the AC-61 record)

Same box (Node v24.13.0, WSL2), median of 5 runs, the benchmark payload above (id + two labels
+ two critiques ≈ 170 bytes/row), panel `[judge, human]`, seed 42, tier B from
`bootstrapTier`, α budget `alphaBootstrapTier`. `bootstrapBundle` is measured alone and the
full `analyzeVerdicts` dispatch (parse → report → CIs) with the 1,000 ms cooperative budget:

| Rows | B | α B | acc+κ CI | + α CI | full dispatch |
|---|---:|---:|---:|---:|---:|
| 1,000 | 2,000 | 2,000 | 13 ms | 14 ms | 18 ms |
| 20,000 | 2,000 | 2,000 | 131 ms | 132 ms | 222 ms |
| 50,000 | 2,000 | 2,000 | 330 ms | 334 ms | 528 ms |
| 100,000 | 1,000 | 250 | 403 ms | 384 ms | 893 ms |
| 150,000 | 500 | 250 | 267 ms | 263 ms | 894 ms |
| 200,000 | 500 | 250 | 351 ms | 357 ms | 1,280 ms |

α costs ≤ 6 ms at every tier because it shares the resample's class-pair counts instead of
rebuilding the coincidence matrix (the §1.8 protocol: one RNG stream, one index array, one
fused pass). The dispatch stays inside the 1,500 ms watchdog and inside the 1,000 ms
cooperative budget at ≤ 150,000 rows; at 200,000 rows the checkpoint interval can let the
milliseconds drift past the budget, and the FM-7 abort (CIs dropped — disclosed in the receipt,
point statistics and `B` unchanged) is the documented escape hatch.

Reproduce:

```bash
cat > <repo>/app/tools/judgewright/_lib/__tests__/tmp.bench.test.ts <<'EOF'
import { it } from "vitest";
import { analyzeVerdicts } from "../analyze";
import { alphaBootstrapTier, bootstrapBundle, bootstrapTier, encodePanel } from "../bootstrapCI";
const build = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    JSON.stringify({
      example_id: `ex-${i}`,
      judge_label: i % 3 === 0 ? "fail" : "pass",
      human_label: i % 4 === 0 ? "fail" : "pass",
      judge_critique: "Judge rationale text for row " + i,
      human_critique: "Human rationale text for row " + i,
    })
  ).join("\n");
const median = (runs: number[]) => [...runs].sort((a, b) => a - b)[Math.floor(runs.length / 2)];
it("bench", () => {
  for (const n of [1_000, 20_000, 50_000, 100_000, 150_000, 200_000]) {
    const text = build(n);
    const parsed = analyzeVerdicts(text);
    if (!parsed.ok) throw new Error(parsed.error);
    const rows = parsed.stats.report.disagreements;
    const panel = encodePanel(rows.map((r) => r.judgeLabel), rows.map((r) => r.humanLabel));
    const b = bootstrapTier(n);
    const alphaB = alphaBootstrapTier(n, b);
    const runs: number[] = [];
    const alphaRuns: number[] = [];
    const dispatchRuns: number[] = [];
    for (let r = 0; r < 5; r++) {
      let t = Date.now(); bootstrapBundle(panel, { seed: 42, B: b, alpha: 0.05 }); runs.push(Date.now() - t);
      t = Date.now(); bootstrapBundle(panel, { seed: 42, B: b, alphaB, alpha: 0.05 }); alphaRuns.push(Date.now() - t);
      t = Date.now(); const out = analyzeVerdicts(text, { seed: 42, confidenceLevel: 0.95, deadlineMs: 1_000 });
      dispatchRuns.push(Date.now() - t);
      if (!out.ok) throw new Error(out.error);
    }
    console.log(`n=${n} B=${b} alphaB=${alphaB} | acc+kappa ${median(runs)}ms | +alpha ${median(alphaRuns)}ms | full ${median(dispatchRuns)}ms`);
  }
});
EOF
npx vitest run --reporter=verbose <that file> 2>&1 | grep "n="
```

Reproduce:

```bash
cat > /tmp/bench.test.ts <<'EOF'
import { it } from "vitest";
import { analyzeVerdicts } from "<repo>/app/tools/judgewright/_lib/analyze";
const build = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    JSON.stringify({
      example_id: `ex-${i}`,
      judge_label: i % 3 === 0 ? "fail" : "pass",
      human_label: i % 4 === 0 ? "fail" : "pass",
      judge_critique: "Judge rationale text for row " + i,
      human_critique: "Human rationale text for row " + i,
    })
  ).join("\n");
it("bench", () => {
  for (const n of [1_000, 20_000, 200_000]) {
    const p = build(n);
    const s: number[] = [];
    for (let r = 0; r < 5; r++) {
      const t = process.hrtime.bigint();
      analyzeVerdicts(p);
      s.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
    s.sort((a, b) => a - b);
    console.log(`rows=${n} chars=${p.length} median=${s[2].toFixed(2)}ms`);
  }
});
EOF
npx vitest run /tmp/bench.test.ts
```

## Gates

| Gate | Result |
|---|---|
| `npm install` | 1m03s cold (456 packages) |
| `npm run typecheck` | ~2s |
| `npm run lint` | ~4s |
| `npm test` | 53 tests / ~0.4s |
| `npm run build` | ~11s compile, 8 static routes |
| `npm run test:e2e` | 25 passed / 2.6m (one build + one standalone boot per run; artifact reused within the run) |
| Coverage (`npx vitest run --coverage`) | statements 98.82% · branches 97.36% · functions 100% · lines 98.75% |
| First Load JS (`/tools/judgewright`) | 177 kB (budget 200 kB) |

## Workstation runtime shape (Playwright, standalone artifact)

| Check | Result |
|---|---|
| Root redirect | `307 → /tools/judgewright` |
| Tool route | `200` |
| Worker settle (debounce 0ms tier) | ~650ms per journey (build + boot amortised per run) |
| Worker settle (40ms debounce tier, 6,000 chars) | ~650ms |
| Degraded (blocked `Worker`) | ~880ms to the amber banner + settle |
| Theme flip | ~720ms |
| `⌘⇧C` copy + clipboard read-back | ~580ms |
| Zero non-localhost requests (first paint + full compute) | **0** |

### Two flake fixes worth recording

Both were found by running the suite more than once, and both are real robustness issues
rather than test cosmetics:

1. **Orphaned standalone server.** A `npm run build && node .next/standalone/server.js`
   webServer command leaves a node grandchild behind when Playwright kills only the shell; the
   next run then adopts that stale server, whose hash-named chunks the intervening build has
   replaced — a page that renders from SSR but never hydrates. Fixed by
   `scripts/serve-standalone.sh`, which `exec`s the server so Playwright's child is the server.
2. **Pre-hydration fills.** A `fill()` that lands before React's delegated listeners attach
   never reaches the store: the DOM shows the text while the settled report still describes the
   old content. Fixed by `waitClientReady()`, which requires the pane to reach `ready` (only
   possible once the mounted effects have dispatched) before any field is written, plus
   web-first assertions so a pending debounce tier is awaited instead of raced.

## Why these numbers matter

The placeholder core is cheap *on purpose*: the point of this milestone is the plumbing
(worker, watchdog, debounce, degrade path, persistence scope, layout contract), not the
arithmetic. The M1/M2 numbers that matter — parse, matrix, κ, α, bootstrap CIs at the row caps
— land in this file with the same commands.
