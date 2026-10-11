/**
 * AC-13 — byte-reproducibility ACROSS processes.
 *
 * Invoked as `node --experimental-strip-types repro.entry.ts` (see
 * `package.json` → `golden:one-liner`-style scripts and the
 * `bootstrap.test.ts` cross-process block, which spawns exactly this file and
 * compares its output to the in-process run).
 *
 * It prints the 17-significant-digit strings of the seeded CIs for the AC-10
 * headline fixture, for two different seeds, and fails loudly (exit 1) when
 * the same seed does not reproduce itself in-process or when the two seeds
 * agree. Node resolves only fully-specified specifiers, so every module in
 * this chain names its runtime dependencies with explicit `.ts` extensions —
 * the same files the app imports.
 */

import {
  alphaBootstrapTier,
  bootstrapBundle,
  bootstrapTier,
  encodePanel,
} from "../bootstrapCI.ts";
import { cohensKappa } from "../cohensKappa.ts";
import { krippendorffAlpha } from "../krippendorffAlpha.ts";

/** The AC-10 headline fixture (a=920, b=30, c=20, d=30). */
function fixture(): { judge: string[]; human: string[] } {
  return {
    human: [
      ...Array<string>(920).fill("pos"),
      ...Array<string>(30).fill("neg"),
      ...Array<string>(20).fill("pos"),
      ...Array<string>(30).fill("neg"),
    ],
    judge: [
      ...Array<string>(920).fill("pos"),
      ...Array<string>(30).fill("pos"),
      ...Array<string>(20).fill("neg"),
      ...Array<string>(30).fill("neg"),
    ],
  };
}

/** One CI as three 17-significant-digit strings (the AC-13 comparison unit). */
function ciString(ci: { point: number; low: number; high: number } | null): string {
  if (ci === null) return "null";
  return `${ci.point.toPrecision(17)}/${ci.low.toPrecision(17)}/${ci.high.toPrecision(17)}`;
}

function run(seed: number): string {
  const { judge, human } = fixture();
  const panel = encodePanel(judge, human);
  const b = bootstrapTier(judge.length);
  const bundle = bootstrapBundle(panel, {
    seed,
    B: b,
    alphaB: alphaBootstrapTier(judge.length, b),
    alpha: 0.05,
  });
  // The point statistics ride along so a regression shows up in the diff.
  const points = [
    cohensKappa(judge, human),
    krippendorffAlpha(human.map((humanLabel, i) => [judge[i] as string, humanLabel])).value,
  ]
    .map((value) => (value === null ? "null" : (value as number).toPrecision(17)))
    .join("/");
  return `seed=${seed} ${ciString(bundle.accuracy)} ${ciString(bundle.kappa)} ${ciString(bundle.alpha)} points=${points}`;
}

const first = run(42);
const again = run(42);
const other = run(7);

console.log(`REPRO ${first}`);
console.log(`REPRO ${again}`);
console.log(`REPRO ${other}`);

if (first !== again) {
  console.error("AC-13 FAILED: the same seed is not byte-identical in-process");
  process.exit(1);
}
if (first === other) {
  console.error("AC-13 FAILED: two different seeds produced identical output");
  process.exit(1);
}
