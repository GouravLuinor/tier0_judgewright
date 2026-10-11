/**
 * AC-13 / A14 — byte-reproducibility ACROSS processes, end to end.
 *
 * `repro.entry.ts` proves the SEEDED BOOTSTRAP reproduces itself in another
 * process. This entry proves the whole PIPELINE does: it imports
 * `analyzeVerdicts` — the one function the Web Worker and the synchronous
 * main-thread fallback both call — and prints a stable digest of a full
 * report settled from a pasted JSONL fixture.
 *
 * Invoked as `node --experimental-strip-types repro.analyze.entry.ts`. Node
 * resolves only fully specified specifiers, so every module in this chain
 * names its runtime dependencies with explicit `.ts` extensions — the same
 * files the app imports. A missing extension is exactly the class of bug this
 * entry exists to catch (A14): the bundler tolerates `from "./parse"`, so a
 * typo'd or extension-less specifier ships silently and only fails when
 * someone tries to run the pure core outside the bundler.
 *
 * It prints the digest three times (twice for the same input, once for a
 * second fixture) and exits 1 when the same input does not reproduce itself
 * or when the two fixtures agree.
 */

import { analyzeVerdicts } from "../analyze.ts";
import { countBytes } from "../analyze.ts";
import { DEFAULT_CONFIDENCE_LEVEL, DEFAULT_SEED } from "../constants.ts";
import type { CalibrationReport } from "../types.ts";

/**
 * The AC-10 headline fixture as JSONL: 920 (P,P), 30 (N,P), 20 (P,N), 30 (N,N)
 * — the same 1,000-row session `report.test.ts` pins.
 */
function headline(): string {
  const rows: string[] = [];
  const push = (count: number, human: string, judge: string) => {
    for (let i = 0; i < count; i++) {
      rows.push(
        JSON.stringify({
          example_id: `ex-${String(rows.length).padStart(4, "0")}`,
          judge_label: judge,
          human_label: human,
        })
      );
    }
  };
  push(920, "P", "P");
  push(30, "N", "P");
  push(20, "P", "N");
  push(30, "N", "N");
  return rows.join("\n");
}

/** A second, deliberately different session, so the digest must differ. */
function rotated(): string {
  const rows: string[] = [];
  for (let i = 0; i < 500; i++) {
    rows.push(
      JSON.stringify({
        example_id: `r-${String(i).padStart(4, "0")}`,
        judge_label: i % 2 === 0 ? "pass" : "fail",
        human_label: i % 2 === 0 ? "fail" : "pass",
      })
    );
  }
  return rows.join("\n");
}

/** The CI triple as three 17-significant-digit strings. */
function ciString(ci: { point: number; low: number; high: number } | null): string {
  if (ci === null) return "null";
  return `${ci.point.toPrecision(17)}/${ci.low.toPrecision(17)}/${ci.high.toPrecision(17)}`;
}

const FIGURE = (value: number | null): string =>
  value === null ? "null" : value.toPrecision(17);

/**
 * One digest of a settled report: the figures whose byte-reproducibility is
 * the whole promise, plus the counts that prove the pipeline ran.
 */
function digest(report: CalibrationReport, characters: number): string {
  return [
    `n=${report.n}`,
    `acc=${FIGURE(report.accuracy)}`,
    `kappa=${FIGURE(report.kappa)}`,
    `kappaLinear=${FIGURE(report.kappaLinear)}`,
    `kappaQuadratic=${FIGURE(report.kappaQuadratic)}`,
    `deflation=${FIGURE(report.deflation)}`,
    `alphaPanel=${FIGURE(report.alphaPanel)}`,
    `baseline=${FIGURE(report.baseline.baselineAgreement)}`,
    `ciAccuracy=${ciString(report.ci.accuracy)}`,
    `ciKappa=${ciString(report.ci.kappa)}`,
    `ciAlpha=${ciString(report.ci.alpha)}`,
    `B=${report.bootstrapReplicates}`,
    `alphaReplicates=${report.alphaBootstrapReplicates}`,
    `grade=${report.grade}`,
    `chars=${characters}`,
  ].join(" ");
}

function run(text: string): string {
  // An unconstrained budget, so the CIs are computed rather than dropped and
  // the digest really covers the bootstrap.
  const outcome = analyzeVerdicts(text, {
    deadlineMs: 60_000,
    deadlineAt: Date.now() + 60_000,
    engine: "worker",
    seed: DEFAULT_SEED,
    confidenceLevel: DEFAULT_CONFIDENCE_LEVEL,
  });
  if (!outcome.ok) {
    console.error(`A14 FAILED: the fixture did not analyze: ${outcome.error}`);
    process.exit(1);
  }
  // The byte count rides along so a digest that silently re-encodes the input
  // is visible in the diff.
  return `${digest(outcome.stats.report, countBytes(text))} bytes=${countBytes(text)}`;
}

const first = run(headline());
const again = run(headline());
const other = run(rotated());

console.log(`REPRO-ANALYZE ${first}`);
console.log(`REPRO-ANALYZE ${again}`);
console.log(`REPRO-ANALYZE ${other}`);

if (first !== again) {
  console.error("A14 FAILED: the same input is not byte-identical in-process");
  process.exit(1);
}
if (first === other) {
  console.error("A14 FAILED: two different inputs produced identical digests");
  process.exit(1);
}
