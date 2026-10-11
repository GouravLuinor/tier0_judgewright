/**
 * Judgewright — the reproducible pure-core benchmark (`npm run bench`).
 *
 * Measures what the shipped engine actually costs, on this machine, with this
 * Node build, from the REAL `_lib` modules the app imports (no bundler, no
 * browser, no worker harness):
 *
 *   1. parse            — `parseVerdicts` alone
 *   2. point statistics — `computeReport` with an ALREADY-EXPIRED budget, so
 *                         Phase A (confusion, metrics, κ, α, grade, receipt)
 *                         runs and Phase B (the bootstrap) is skipped
 *   3. κ+α bundle       — `bootstrapBundle` alone, at the tier B the row count
 *                         selects (the κ and α replicates share ONE resample)
 *   4. full dispatch    — `analyzeVerdicts` exactly as the Web Worker calls it
 *                         (`deadlineMs: WORKER_DEADLINE_MS`, the absolute
 *                         budget taken before the parse, A2)
 *   5. full dispatch    — the same pipeline with the budget lifted, so the
 *                         unconstrained cost of a settled report is visible
 *
 * Every cell is the median of n samples; p95 is the nearest-rank 95th
 * percentile of the same samples. The watchdog tier for each payload is
 * printed next to the budget result because it is a function of the
 * CHARACTER count, not the row count.
 *
 * Nothing here is aspirational: if a number moves, the doc moves with it.
 */

import { cpus } from "node:os";
import { hrtime } from "node:process";
import {
  alphaBootstrapTier,
  bootstrapBundle,
  bootstrapTier,
  encodePanel,
} from "../app/tools/judgewright/_lib/bootstrapCI.ts";
import {
  DEFAULT_CONFIDENCE_LEVEL,
  DEFAULT_SEED,
  MAX_INPUT_CHARS,
  MAX_ROWS,
  WORKER_DEADLINE_MS,
  watchdogMsFor,
} from "../app/tools/judgewright/_lib/constants.ts";
import { analyzeVerdicts } from "../app/tools/judgewright/_lib/analyze.ts";
import { computeReport } from "../app/tools/judgewright/_lib/report.ts";
import { parseVerdicts } from "../app/tools/judgewright/_lib/parse.ts";

/** Row counts measured, and how many samples each one takes. */
const SIZES: readonly { rows: number; samples: number }[] = [
  { rows: 1_000, samples: 11 },
  { rows: 20_000, samples: 9 },
  { rows: 50_000, samples: 9 },
  { rows: 100_000, samples: 9 },
  { rows: 150_000, samples: 7 },
  { rows: 200_000, samples: 7 },
];

/**
 * The two payload widths the product really sees:
 *   "wide"   — example_id + both labels + judge_score + both critiques
 *              (≈205 chars/row; the critique-bearing session; the shape that
 *              hits the A16 character cap at ≈190k rows)
 *   "narrow" — example_id + both labels only (≈56 chars/row; the largest row
 *              count that is still inside MAX_INPUT_CHARS at 200k rows)
 */
const WIDTHS: readonly { name: "wide" | "narrow"; maxRows: number }[] = [
  { name: "wide", maxRows: 200_000 },
  { name: "narrow", maxRows: 200_000 },
];

function now(): number {
  return Number(hrtime.bigint()) / 1e6;
}

/** One synthetic JSONL payload of `rows` rows at the requested width. */
function payload(rows: number, width: "wide" | "narrow"): string {
  const out: string[] = [];
  for (let i = 0; i < rows; i++) {
    const judge = i % 3 === 0 ? "fail" : "pass";
    const human = i % 4 === 0 ? "fail" : "pass";
    const base: Record<string, unknown> = {
      example_id: `ex-${i}`,
      judge_label: judge,
      human_label: human,
    };
    if (width === "wide") {
      base.judge_score = i % 7 === 0 ? 0.12 : 0.88;
      base.judge_critique = `Judge rationale text for row ${i}`;
      base.human_critique = `Human rationale text for row ${i}`;
    }
    out.push(JSON.stringify(base));
  }
  return out.join("\n");
}

function median(samples: readonly number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

/** Nearest-rank p95 (the smallest sample ≥ the 95th percentile). */
function p95(samples: readonly number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(0.95 * sorted.length));
  return sorted[rank - 1] ?? Number.NaN;
}

function ms(value: number): string {
  return value.toFixed(2).padStart(9);
}

interface Cell {
  median: number;
  p95: number;
  samples: number;
}

function measure(run: () => void, samples: number): Cell {
  const timings: number[] = [];
  // One untimed warm-up so the first sample is not paying for JIT compilation.
  run();
  for (let i = 0; i < samples; i++) {
    const started = now();
    run();
    timings.push(now() - started);
  }
  return { median: median(timings), p95: p95(timings), samples };
}

/**
 * The same timed measurement, but the probe returns whether that run dropped
 * its CIs, so the drop count covers exactly the `samples` timed runs (the
 * warm-up is discounted — it is not part of the sample).
 */
function measureDropped(
  probe: () => boolean,
  samples: number
): { cell: Cell; dropped: number } {
  probe(); // warm-up, untimed and uncounted
  const timings: number[] = [];
  let dropped = 0;
  for (let i = 0; i < samples; i++) {
    const started = now();
    const droppedThisRun = probe();
    timings.push(now() - started);
    if (droppedThisRun) dropped++;
  }
  return {
    cell: { median: median(timings), p95: p95(timings), samples },
    dropped,
  };
}

/** Rows the label columns actually contribute, so the panel can be encoded. */
function labelColumns(rows: ReturnType<typeof parseVerdicts>): {
  judge: string[];
  human: string[];
} {
  const judge: string[] = [];
  const human: string[] = [];
  for (const row of rows.verdicts) {
    judge.push(row.judgeLabel);
    human.push(row.humanLabels[0] ?? "");
  }
  return { judge, human };
}

const machine = {
  node: process.version,
  cpus: cpus().length,
  model: cpus()[0]?.model ?? "unknown",
  platform: process.platform,
};

console.log(
  `# judgewright bench — node ${machine.node} · ${machine.cpus} × ${machine.model} · ${machine.platform}`
);
console.log(
  `# worker cooperative budget ${WORKER_DEADLINE_MS} ms · default seed ${DEFAULT_SEED} · confidence ${DEFAULT_CONFIDENCE_LEVEL}`
);
console.log("");

/**
 * A16 — the two caps MULTIPLY. MAX_ROWS (200,000) and MAX_INPUT_CHARS
 * (40,000,000) can never both bind: a critique-bearing row costs ~200
 * characters, so 200,000 of them can already be past the character ceiling.
 * The probe measures the payload's real row width and dispatches the largest
 * in-cap row count for real, so the ceiling is a measurement rather than an
 * assertion.
 */
{
  const widePerRow = payload(1_000, "wide").length / 1_000;
  const charCeiling = Math.floor(MAX_INPUT_CHARS / widePerRow);
  const rowCeiling = Math.min(charCeiling, MAX_ROWS);
  console.log(
    `## capacity (A16) — wide payload measures ${widePerRow.toFixed(1)} chars/row, so the ` +
      `40,000,000-character ceiling allows ${charCeiling.toLocaleString("en-US")} rows while ` +
      `MAX_ROWS allows ${MAX_ROWS.toLocaleString("en-US")}; the binding limit is ` +
      `${rowCeiling.toLocaleString("en-US")} rows`
  );
  const probes = [...new Set([rowCeiling, MAX_ROWS])];
  for (const rows of probes) {
    const text = payload(rows, "wide");
    const outcome = analyzeVerdicts(text, {
      deadlineMs: 60_000,
      deadlineAt: Date.now() + 60_000,
      engine: "worker",
      seed: DEFAULT_SEED,
      confidenceLevel: DEFAULT_CONFIDENCE_LEVEL,
    });
    console.log(
      `  ${rows.toLocaleString("en-US")} wide rows = ${text.length.toLocaleString("en-US")} chars → ` +
        (outcome.ok
          ? `settles a report (n=${outcome.stats.report.n})`
          : `REJECTED before parsing: ${outcome.error}`)
    );
  }
  console.log("");
}

for (const width of WIDTHS) {
  console.log(`## payload width "${width.name}" (in-cap ceiling ${width.maxRows.toLocaleString("en-US")} rows)`);
  for (const { rows, samples } of SIZES) {
    if (rows > width.maxRows) continue;
    const text = payload(rows, width.name);
    const charsPerRow = Math.round(text.length / rows);

    // 1. parse alone.
    const parsed = parseVerdicts(text);
    if (parsed.fatal || parsed.verdicts.length === 0) {
      throw new Error(`bench payload did not parse at ${rows} rows`);
    }
    const parseCell = measure(() => {
      parseVerdicts(text);
    }, samples);

    // 2. Phase A only: an already-expired budget skips the bootstrap, so this
    //    is the point-statistics cost (confusion, metrics, κ, α, grade, receipt).
    const pointCell = measure(() => {
      computeReport(parsed.verdicts, {
        seed: DEFAULT_SEED,
        confidenceLevel: DEFAULT_CONFIDENCE_LEVEL,
        deadlineMs: WORKER_DEADLINE_MS,
        deadlineAt: 0,
        engine: "worker",
      });
    }, samples);

    // 3. the κ+α bootstrap bundle at the tier this row count selects.
    const { judge, human } = labelColumns(parsed);
    const panel = encodePanel(judge, human);
    const b = bootstrapTier(rows);
    const alphaB = alphaBootstrapTier(rows, b);
    const bundleCell = measure(() => {
      bootstrapBundle(panel, { seed: DEFAULT_SEED, B: b, alphaB, alpha: 0.05 });
    }, samples);

    // 4. the full dispatch exactly as the worker issues it (budget 1,000 ms,
    //    absolute boundary taken before the parse — A2).
    const budgeted = measureDropped(
      () => {
        const outcome = analyzeVerdicts(text, {
          deadlineMs: WORKER_DEADLINE_MS,
          engine: "worker",
          seed: DEFAULT_SEED,
          confidenceLevel: DEFAULT_CONFIDENCE_LEVEL,
        });
        if (!outcome.ok) throw new Error(outcome.error);
        return outcome.stats.report.ciDropped;
      },
      samples
    );
    const budgetedCell = budgeted.cell;

    // 5. the same pipeline with the budget lifted (60 s), for the true cost.
    const unconstrainedCell = measure(() => {
      const outcome = analyzeVerdicts(text, {
        deadlineMs: 60_000,
        deadlineAt: Date.now() + 60_000,
        engine: "worker",
        seed: DEFAULT_SEED,
        confidenceLevel: DEFAULT_CONFIDENCE_LEVEL,
      });
      if (!outcome.ok) throw new Error(outcome.error);
    }, samples);

    console.log(
      `rows=${String(rows).padStart(6)} chars=${text.length.toLocaleString("en-US").padStart(12)} ` +
        `charsPerRow=${charsPerRow} B=${b} alphaB=${alphaB} ` +
        `watchdog=${watchdogMsFor(text.length)}ms n=${pointCell.samples}`
    );
    console.log(
      `  parse            median=${ms(parseCell.median)} ms  p95=${ms(parseCell.p95)} ms`
    );
    console.log(
      `  point statistics median=${ms(pointCell.median)} ms  p95=${ms(pointCell.p95)} ms`
    );
    console.log(
      `  kappa+alpha CI   median=${ms(bundleCell.median)} ms  p95=${ms(bundleCell.p95)} ms`
    );
    console.log(
      `  full dispatch    median=${ms(budgetedCell.median)} ms  p95=${ms(budgetedCell.p95)} ms  ` +
        `(1,000 ms budget, CIs dropped in ${budgeted.dropped}/${samples} runs)`
    );
    console.log(
      `  full dispatch    median=${ms(unconstrainedCell.median)} ms  p95=${ms(unconstrainedCell.p95)} ms  ` +
        `(budget lifted)`
    );
  }
  console.log("");
}
