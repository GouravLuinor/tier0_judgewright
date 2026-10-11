import { describe, expect, it } from "vitest";
import {
  CALIBRATION_AMBIGUOUS_REASON,
  CALIBRATION_MISMATCH_COPY,
  CALIBRATION_NOT_COMPUTABLE_REASON,
  brier,
  calibrationPanel,
  ece,
} from "../calibration.ts";
import { computeReport } from "../report.ts";
import { parseVerdicts } from "../parse.ts";
import type { RawVerdict } from "../types.ts";

/** Reference tolerance: external references asserted to ±1e-12 (SPEC §6). */
const TOL = 1e-12;
function near(value: number | null | undefined, expected: number): boolean {
  return value !== null && value !== undefined && Math.abs(value - expected) <= TOL;
}

/**
 * The PLAN §1.5 hand fixture. Under p-positive semantics the judge_score is
 * P(reference is positive); the OUTCOME is (human label is the positive class):
 *   · 4 rows score 0.9, judge=pos, human=pos  ⇒ y=1
 *   · 4 rows score 0.1, judge=pos, human=neg  ⇒ y=0
 *   · 2 rows score 0.6, judge=neg, human=neg  ⇒ y=0
 * positiveClass is the second sorted label ("pos"). Only the two judge-negative
 * .6 rows flip under confidence mode (p = 1 − s).
 */
function handRow(
  exampleId: string,
  judge: "pos" | "neg",
  human: "pos" | "neg",
  score: number
): RawVerdict {
  return {
    exampleId,
    judgeLabel: judge,
    humanLabels: [human],
    judgeScore: score,
    humanScore: null,
    judgeCritique: null,
    humanCritique: null,
    judgeInput: null,
    judgeOutput: null,
    position: null,
    preferredLonger: null,
    lineNumber: 0,
  };
}

const HAND_ROWS: RawVerdict[] = [
  handRow("h1", "pos", "pos", 0.9),
  handRow("h2", "pos", "pos", 0.9),
  handRow("h3", "pos", "pos", 0.9),
  handRow("h4", "pos", "pos", 0.9),
  handRow("h5", "pos", "neg", 0.1),
  handRow("h6", "pos", "neg", 0.1),
  handRow("h7", "pos", "neg", 0.1),
  handRow("h8", "pos", "neg", 0.1),
  handRow("h9", "neg", "neg", 0.6),
  handRow("h10", "neg", "neg", 0.6),
];

// The resolved per-row positive probability arrays for each mode.
const SCORES_PPOS = Float64Array.from([
  0.9, 0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.1, 0.6, 0.6,
]);
const SCORES_CONF = Float64Array.from([
  0.9, 0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.1, 0.4, 0.4,
]);
const CORRECT = [1, 1, 1, 1, 0, 0, 0, 0, 0, 0];

describe("ece / brier — the PLAN §1.5 hand fixture (AC-11/12/40)", () => {
  it("ECE (equal-width, 10 bins) is 0.2 under p-positive", () => {
    expect(near(ece(SCORES_PPOS, CORRECT, 10, "width"), 0.2)).toBe(true);
  });

  it("ECE (equal-width, 10 bins) is 0.16 under confidence on the SAME rows", () => {
    expect(near(ece(SCORES_CONF, CORRECT, 10, "width"), 0.16)).toBe(true);
  });

  it("ECE (equal-frequency, 5 bins) is also 0.2 — the two binning schemes agree here", () => {
    expect(near(ece(SCORES_PPOS, CORRECT, 5, "freq"), 0.2)).toBe(true);
  });

  it("Brier is 0.07999999999999999 under p-positive and 0.04 under confidence", () => {
    expect(near(brier(SCORES_PPOS, CORRECT, "width"), 0.07999999999999999)).toBe(true);
    expect(near(brier(SCORES_CONF, CORRECT, "width"), 0.04)).toBe(true);
  });

  it("equal-width and equal-frequency are genuinely different partitions", () => {
    // A fixture spread unevenly across the range so the two bin rules diverge:
    // equal-width over-fills the low bins, equal-frequency balances counts.
    const spread = Float64Array.from([
      0.01, 0.02, 0.03, 0.04, 0.05, 0.95, 0.96, 0.97, 0.98, 0.99,
    ]);
    const y = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
    const width = ece(spread, y, 10, "width");
    const freq = ece(spread, y, 5, "freq");
    expect(width).not.toBeNull();
    expect(freq).not.toBeNull();
    expect(Math.abs((width as number) - (freq as number))).toBeGreaterThan(1e-6);
  });
});

describe("ece / brier — the out-of-range / no-score guards (AC-37 / FM-3)", () => {
  it("skips an out-of-range score instead of clamping it — the count is honest", () => {
    // The second row carries 1.7 (NOT a probability). It is dropped, never
    // clamped into bin 9: only the 0.9 row is consumed, so over the 1 usable
    // row ECE = |1 − 0.9| = 0.1 and Brier = (0.9 − 1)² = 0.01.
    const panel = calibrationPanel(
      [handRow("a", "pos", "pos", 0.9), handRow("b", "pos", "pos", 1.7)],
      { positiveClass: "pos", judgeScoreMode: "p-positive", bins: 10, binMode: "width" }
    );
    expect(panel?.scoreCount).toBe(1);
    expect(near(panel?.ece, 0.1)).toBe(true);
    expect(near(panel?.brier, 0.01)).toBe(true);
  });

  it("reports null + reason when no row carries a usable score (never 0)", () => {
    const panel = calibrationPanel(
      [handRow("a", "pos", "neg", 0.9), handRow("b", "neg", "pos", 0.2)].map((r) => ({
        ...r,
        judgeScore: null,
      })),
      { positiveClass: "pos", judgeScoreMode: "p-positive", bins: 10, binMode: "width" }
    );
    expect(panel?.computable).toBe(false);
    expect(panel?.ece).toBeNull();
    expect(panel?.brier).toBeNull();
    expect(panel?.reason).toBe(CALIBRATION_NOT_COMPUTABLE_REASON);
  });
});

describe("calibrationPanel — the AC-40 mode difference on the SAME rows", () => {
  it("yields ECE 0.2 / Brier 0.08 under p-positive and 0.16 / 0.04 under confidence", () => {
    const ppos = calibrationPanel(HAND_ROWS, {
      positiveClass: "pos",
      judgeScoreMode: "p-positive",
      bins: 10,
      binMode: "width",
    });
    const conf = calibrationPanel(HAND_ROWS, {
      positiveClass: "pos",
      judgeScoreMode: "confidence",
      bins: 10,
      binMode: "width",
    });
    expect(near(ppos?.ece, 0.2)).toBe(true);
    expect(near(ppos?.brier, 0.07999999999999999)).toBe(true);
    expect(near(conf?.ece, 0.16)).toBe(true);
    expect(near(conf?.brier, 0.04)).toBe(true);
    // The panel prints the mode it computed and the positive class it used.
    expect(ppos?.scoreMode).toBe("p-positive");
    expect(conf?.scoreMode).toBe("confidence");
    expect(ppos?.positiveClass).toBe("pos");
    expect(ppos?.scoreCount).toBe(10);
  });

  it("surfaces the amber mode mismatch when ΔECE > 0.05 (AC-41/C2)", () => {
    // 10 rows, judge_score 0.6 on every row, judge negative while human is
    // positive: the scores only make sense as confidences, so under the default
    // p-positive the panel warns rather than silently choosing.
    const ambiguous: RawVerdict[] = Array.from({ length: 10 }, (_, i) =>
      handRow(`amb-${i}`, "neg", "pos", 0.6)
    );
    const panel = calibrationPanel(ambiguous, {
      positiveClass: "pos",
      judgeScoreMode: "p-positive",
      bins: 10,
      binMode: "width",
    });
    expect(panel?.mismatchWarning).toBe(CALIBRATION_MISMATCH_COPY);
    expect(CALIBRATION_MISMATCH_COPY).toContain(
      "your scores look like confidences, not probabilities"
    );
    // Under confidence mode the same rows calm down — no warning.
    const calm = calibrationPanel(ambiguous, {
      positiveClass: "pos",
      judgeScoreMode: "confidence",
      bins: 10,
      binMode: "width",
    });
    expect(calm?.mismatchWarning).toBeNull();
  });
});

/**
 * A12 — a duplicated `judge_score` column makes the calibration panel NOT
 * COMPUTABLE. The panel used to compute anyway from whichever alias the
 * parser resolved first, which is a confident number with no single meaning
 * behind it. Now the ambiguity is a stop: null values, a reason naming the
 * cause, and no fabricated 0 (FM-3 / FM-12).
 */
describe("calibrationPanel — the ambiguous score column (A12)", () => {
  const OPTIONS = {
    positiveClass: "pos",
    judgeScoreMode: "p-positive" as const,
    bins: 10,
    binMode: "width" as const,
  };

  it("is not computable when two columns map to judge_score", () => {
    const panel = calibrationPanel(HAND_ROWS, {
      ...OPTIONS,
      judgeScoreAmbiguous: true,
    });

    expect(panel?.computable).toBe(false);
    expect(panel?.ece).toBeNull();
    expect(panel?.brier).toBeNull();
    expect(panel?.reason).toBe(CALIBRATION_AMBIGUOUS_REASON);
    expect(panel?.ambiguousReason).toBe(CALIBRATION_AMBIGUOUS_REASON);
    // The disclosure fields still say which mode / class WOULD have applied.
    expect(panel?.scoreMode).toBe("p-positive");
    expect(panel?.positiveClass).toBe("pos");
    expect(panel?.scoreCount).toBe(0);
    expect(panel?.mismatchWarning).toBeNull();
  });

  it("the reason names the duplicate column and what to do about it", () => {
    expect(CALIBRATION_AMBIGUOUS_REASON).toContain("judge_score");
    expect(CALIBRATION_AMBIGUOUS_REASON).toContain("rename one");
    // And it is distinct from the no-scores reason, so the two causes are
    // never conflated in the UI.
    expect(CALIBRATION_AMBIGUOUS_REASON).not.toBe(CALIBRATION_NOT_COMPUTABLE_REASON);
  });

  it("an unambiguous panel computes normally on the same rows", () => {
    const panel = calibrationPanel(HAND_ROWS, {
      ...OPTIONS,
      judgeScoreAmbiguous: false,
    });
    expect(panel?.computable).toBe(true);
    expect(near(panel?.ece, 0.2)).toBe(true);
    expect(panel?.reason).toBeNull();
  });

  it("the flag defaults to off, so existing callers are unaffected", () => {
    const panel = calibrationPanel(HAND_ROWS, OPTIONS);
    expect(panel?.computable).toBe(true);
    expect(near(panel?.ece, 0.2)).toBe(true);
  });

  it("computeReport carries the parse-derived ambiguity into the panel", () => {
    // The full path: a duplicated score column in the paste → the flag on the
    // ParseResult → the not-computable panel on the settled report.
    const text = [
      '{"example_id":"h1","judge_label":"pos","human_label":"pos","judge_score":0.9,"confidence":0.9}',
      '{"example_id":"h2","judge_label":"pos","human_label":"neg","judge_score":0.1,"confidence":0.1}',
      '{"example_id":"h3","judge_label":"neg","human_label":"neg","judge_score":0.6,"confidence":0.6}',
    ].join("\n");
    const report = computeReport(parseVerdicts(text).verdicts, {
      seed: 42,
      confidenceLevel: 0.95,
      engine: "worker",
      judgeScoreMode: "p-positive",
      deadlineMs: 60_000,
      deadlineAt: Date.now() + 60_000,
      judgeScoreAmbiguous: parseVerdicts(text).judgeScoreAmbiguous,
    });

    expect(report.calibration?.computable).toBe(false);
    expect(report.calibration?.ece).toBeNull();
    expect(report.calibration?.brier).toBeNull();
    expect(report.calibration?.reason).toBe(CALIBRATION_AMBIGUOUS_REASON);
    // The rest of the report is untouched: κ, α and the CIs still settle.
    expect(report.kappa).not.toBeNull();
    expect(report.alphaPanel).not.toBeNull();
  });

  it("an unambiguous paste still computes the panel end to end", () => {
    const text = [
      '{"example_id":"h1","judge_label":"pos","human_label":"pos","judge_score":0.9}',
      '{"example_id":"h2","judge_label":"pos","human_label":"neg","judge_score":0.1}',
      '{"example_id":"h3","judge_label":"neg","human_label":"neg","judge_score":0.6}',
    ].join("\n");
    const parsed = parseVerdicts(text);
    const report = computeReport(parsed.verdicts, {
      seed: 42,
      confidenceLevel: 0.95,
      engine: "worker",
      judgeScoreMode: "p-positive",
      deadlineMs: 60_000,
      deadlineAt: Date.now() + 60_000,
      judgeScoreAmbiguous: parsed.judgeScoreAmbiguous,
    });
    expect(report.calibration?.computable).toBe(true);
    expect(report.calibration?.reason).toBeNull();
  });
});

describe("report + parse — the AC-37 out-of-range boundary", () => {
  it("the parser nulls an out-of-range judge_score with a line-numbered issue, never clamping", () => {
    const text = [
      '{"example_id":"r1","judge_label":"pos","human_label":"pos","judge_score":0.9}',
      '{"example_id":"r2","judge_label":"pos","human_label":"neg","judge_score":1.7}',
    ].join("\n");
    const parsed = parseVerdicts(text);
    const r2 = parsed.verdicts.find((r) => r.exampleId === "r2");
    expect(r2?.judgeScore).toBeNull(); // treated as ABSENT — never 1.0
    const issue = parsed.issues.find((i) => i.reason.includes("outside [0,1]"));
    expect(issue).toBeDefined();
    // Line-numbered in the copy; treated as absent, never clamped.
    expect(issue?.reason).toContain("line 2:");
    expect(issue?.reason).toContain("never clamped");
  });

  it("computeReport builds the D3 calibration panel through the pure seam", () => {
    const report = computeReport(HAND_ROWS, {
      seed: 42,
      confidenceLevel: 0.95,
      engine: "worker",
      judgeScoreMode: "p-positive",
      positiveClass: "pos",
      deadlineMs: 1_000,
    });
    expect(near(report.calibration?.ece, 0.2)).toBe(true);
    expect(near(report.calibration?.brier, 0.07999999999999999)).toBe(true);

    const confReport = computeReport(HAND_ROWS, {
      seed: 42,
      confidenceLevel: 0.95,
      engine: "worker",
      judgeScoreMode: "confidence",
      positiveClass: "pos",
      deadlineMs: 1_000,
    });
    expect(near(confReport.calibration?.ece, 0.16)).toBe(true);
    expect(near(confReport.calibration?.brier, 0.04)).toBe(true);
  });
});
