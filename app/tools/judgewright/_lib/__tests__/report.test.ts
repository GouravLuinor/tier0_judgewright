import { describe, expect, it } from "vitest";
import { computeReport } from "../report";
import { analyzeVerdicts } from "../analyze";
import { parseVerdicts } from "../parse";
import type { RawVerdict } from "../types";

/** Reference tolerance: external references are asserted to ±1e-12 (SPEC §6). */
const TOL = 1e-12;

/** Builds n rows from 2×2 cell counts: [human][judge] over two labels. */
function binaryRows(a: number, b: number, c: number, d: number): RawVerdict[] {
  const rows: RawVerdict[] = [];
  const push = (human: string, judge: string) =>
    rows.push({
      exampleId: `ex-${String(rows.length + 1).padStart(4, "0")}`,
      judgeLabel: judge,
      humanLabels: [human],
      judgeScore: null,
      humanScore: null,
      judgeCritique: null,
      humanCritique: null,
      judgeInput: null,
      judgeOutput: null,
      position: null,
      preferredLonger: null,
      lineNumber: rows.length + 1,
    });
  for (let i = 0; i < a; i++) push("pos", "pos");
  for (let i = 0; i < b; i++) push("neg", "pos");
  for (let i = 0; i < c; i++) push("pos", "neg");
  for (let i = 0; i < d; i++) push("neg", "neg");
  return rows;
}

const DEFAULT_OPTIONS = {
  seed: 42,
  confidenceLevel: 0.95,
  deadlineMs: 1_000,
  engine: "worker" as const,
};

/**
 * The AC-10 headline fixture: 1,000 binary verdicts with a = 920, b = 30,
 * c = 20, d = 30; human marginals 940/60, judge marginals 950/50.
 */
function headlineFixture(): RawVerdict[] {
  return binaryRows(920, 30, 20, 30);
}

describe("computeReport — the AC-10 headline fixture", () => {
  const report = computeReport(headlineFixture(), DEFAULT_OPTIONS);

  it("agreement is 0.95", () => {
    expect(report.n).toBe(1000);
    expect(report.agreementRows).toBe(950);
    expect(report.accuracy).toBeCloseTo(0.95, 12);
    expect(report.rawAgreement).toBeCloseTo(0.95, 12);
    expect(Math.abs(report.accuracy - 0.95)).toBeLessThanOrEqual(TOL);
  });

  it("unweighted κ is 0.5192307692307692", () => {
    expect(report.kappa).not.toBeNull();
    expect(Math.abs((report.kappa as number) - 0.5192307692307692)).toBeLessThanOrEqual(
      TOL
    );
    expect(report.kappaUndefinedReason).toBeNull();
  });

  it("the Δκ deflation is 0.4307692307692308", () => {
    expect(report.deflation).not.toBeNull();
    expect(Math.abs((report.deflation as number) - 0.4307692307692308)).toBeLessThanOrEqual(
      TOL
    );
  });

  it("the chance baseline is 0.94 with majority class pos", () => {
    expect(report.baseline.baselineAgreement).toBeCloseTo(0.94, 12);
    expect(report.baseline.majorityClass).toBe("pos");
    expect(report.baseline.baselineKappa).toBe(0);
    expect(report.liftOverBaseline).toBeCloseTo(0.01, 12);
  });

  it("carries the confusion matrix, the binary metrics and the label set", () => {
    expect(report.labels).toEqual(["neg", "pos"]); // sorted ascending
    expect(report.binary).toBe(true);
    expect(report.positiveClass).toBe("pos"); // second sorted label
    // rows = human [neg, pos], cols = judge [neg, pos]; b and c noted below.
    expect(report.confusion.matrix).toEqual([
      [30, 30], // human neg: d=30 agree, b=30 judge-positive
      [20, 920], // human pos: c=20 judge-negative, a=920 agree
    ]);
    expect(report.confusion.rowTotals).toEqual([60, 940]); // human marginals
    expect(report.confusion.colTotals).toEqual([50, 950]); // judge marginals
    expect(report.binaryMetrics?.tp).toBe(920);
    expect(report.binaryMetrics?.fp).toBe(30);
    expect(report.binaryMetrics?.fn).toBe(20);
    expect(report.binaryMetrics?.tn).toBe(30);
    expect(report.multiclass).toBeNull();
  });

  it("stamps the engine, the deadline and the honest counts", () => {
    expect(report.engine).toBe("worker");
    expect(report.truncated).toBe(false);
    expect(report.rowCount).toBe(1000);
    expect(report.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(report.receipt).toContain("κ = (A·n − S) / (n² − S)");
  });
});

describe("computeReport — the deferred seams are typed, not fake", () => {
  const report = computeReport(headlineFixture(), DEFAULT_OPTIONS);

  it("leaves α, the CIs, ECE/Brier, the grade and the bias panel unfilled", () => {
    expect(report.alphaPanel).toBeNull();
    expect(report.alphaHumans).toBeNull();
    expect(report.alphaReplicates).toBeNull();
    expect(report.ci.accuracy).toBeNull();
    expect(report.ci.kappa).toBeNull();
    expect(report.ci.alpha).toBeNull();
    expect(report.calibration).toBeNull();
    expect(report.grade).toBe("—");
    expect(report.bias.computable).toBe(false);
    expect(report.bias.note).toContain("Not computable from your input");
    expect(report.kappaLinear).toBeNull();
    expect(report.kappaQuadratic).toBeNull();
    expect(report.disagreements).toEqual([]);
    expect(report.bootstrapReplicates).toBe(0);
    expect(report.ciDropped).toBe(false);
  });
});

describe("computeReport — form-agnostic statistics (AC-28)", () => {
  it("the report is identical whether the rows arrive as JSONL or CSV", () => {
    const jsonl = [
      '{"example_id":"ex-001","judge_label":"pass","human_label":"pass"}',
      '{"example_id":"ex-002","judge_label":"fail","human_label":"pass"}',
      '{"example_id":"ex-003","judge_label":"pass","human_label":"fail"}',
      '{"example_id":"ex-004","judge_label":"fail","human_label":"fail"}',
    ].join("\n");
    const csv = [
      "example_id,judge_label,human_label",
      "ex-001,pass,pass",
      "ex-002,fail,pass",
      "ex-003,pass,fail",
      "ex-004,fail,fail",
    ].join("\n");

    const fromJsonl = computeReport(parseVerdicts(jsonl).verdicts, DEFAULT_OPTIONS);
    const fromCsv = computeReport(parseVerdicts(csv).verdicts, DEFAULT_OPTIONS);

    // Compare everything except the wall-clock field.
    const { executionTimeMs: _a, ...left } = fromJsonl;
    const { executionTimeMs: _b, ...right } = fromCsv;
    expect(left).toEqual(right);
  });
});

describe("computeReport — κ-class reports (AC-46)", () => {
  it("{GOOD, OK, BAD} ships a full k-class report with no error", () => {
    // computeReport receives already-normalized rows: the parser lowercases
    // {GOOD, OK, BAD} to {good, ok, bad} before the report is built.
    const rows: RawVerdict[] = [
      ["good", "good"],
      ["good", "ok"],
      ["ok", "ok"],
      ["ok", "bad"],
      ["bad", "bad"],
      ["bad", "good"],
    ].map(([judge, human], i) => ({
      exampleId: `ex-${i}`,
      judgeLabel: judge,
      humanLabels: [human],
      judgeScore: null,
      humanScore: null,
      judgeCritique: null,
      humanCritique: null,
      judgeInput: null,
      judgeOutput: null,
      position: null,
      preferredLonger: null,
      lineNumber: i + 1,
    }));

    const report = computeReport(rows, DEFAULT_OPTIONS);
    expect(report.binary).toBe(false);
    expect(report.labels).toEqual(["bad", "good", "ok"]);
    // rows = human [bad, good, ok]: bad=[1,0,1] good=[1,1,0] ok=[0,1,1].
    expect(report.confusion.matrix).toEqual([
      [1, 0, 1],
      [1, 1, 0],
      [0, 1, 1],
    ]);
    expect(report.binaryMetrics).toBeNull();
    expect(report.multiclass?.perLabel).toHaveLength(3);
    expect(report.multiclass?.macroF1).not.toBeNull();
    expect(report.positiveClass).toBe("good"); // second sorted label
  });
});

describe("computeReport — the degenerate guard (AC-29 / FM-4)", () => {
  it("a single-label rater yields kappa null with the reason, not zero", () => {
    const rows: RawVerdict[] = Array.from({ length: 5 }, (_, i) => ({
      exampleId: `ex-${i}`,
      judgeLabel: "pass",
      humanLabels: [i < 3 ? "pass" : "fail"],
      judgeScore: null,
      humanScore: null,
      judgeCritique: null,
      humanCritique: null,
      judgeInput: null,
      judgeOutput: null,
      position: null,
      preferredLonger: null,
      lineNumber: i + 1,
    }));

    const report = computeReport(rows, DEFAULT_OPTIONS);
    expect(report.kappa).toBeNull();
    expect(report.kappaUndefinedReason).toBe(
      "κ is undefined: no label variance to correct for. Report accuracy instead."
    );
    expect(report.deflation).toBeNull();
    // The rest of the report still computes — accuracy is the honest fallback.
    expect(report.accuracy).toBeCloseTo(0.6, 12);
    expect(report.baseline.baselineAgreement).toBeCloseTo(0.6, 12);
  });
});

describe("analyzeVerdicts — the FM-17 envelope (AC-35)", () => {
  it("all rows invalid ⇒ no report, the verbatim copy and the first issues", () => {
    const text = [
      '{"judge_label":"pass","human_label":"pass"}',
      '{"example_id":"ex-002","judge_label":"pass"}',
      "{still broken",
    ].join("\n");

    const outcome = analyzeVerdicts(text);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBe(
      "No usable rows — every row failed validation. Fix the first issue and try again."
    );
    expect(outcome.issues).toHaveLength(3);
    expect(outcome.issueCount).toBe(3);
  });

  it("an empty paste is an honest error value, never a zero-filled report", () => {
    const outcome = analyzeVerdicts("   \n  ");
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBe("Nothing to analyze yet — paste verdicts as JSONL or CSV.");
  });
});

describe("analyzeVerdicts — the settled D1 report", () => {
  it("computes the AC-10 headline end to end through the parse seam", () => {
    const rows = headlineFixture();
    const text = rows
      .map(
        (row) =>
          `{"example_id":"${row.exampleId}","judge_label":"${row.judgeLabel}","human_label":"${row.humanLabels[0]}"}`
      )
      .join("\n");

    const outcome = analyzeVerdicts(text, DEFAULT_OPTIONS);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const { report } = outcome.stats;
    expect(report.n).toBe(1000);
    expect(report.accuracy).toBeCloseTo(0.95, 12);
    expect(report.kappa).not.toBeNull();
    expect(Math.abs((report.kappa as number) - 0.5192307692307692)).toBeLessThanOrEqual(
      TOL
    );
    expect(report.baseline.baselineAgreement).toBeCloseTo(0.94, 12);

    // The honest paste counts ride along, describing the WHOLE paste.
    expect(outcome.stats.characterCount).toBe(text.length);
    expect(outcome.stats.lineCount).toBe(1000);
    expect(outcome.stats.parse.format).toBe("jsonl");
    expect(outcome.stats.parse.rowCount).toBe(1000);
    expect(outcome.stats.parse.issues).toEqual([]);
  });

  it("stamps the engine it ran on", () => {
    const outcome = analyzeVerdicts(
      '{"example_id":"a","judge_label":"pass","human_label":"fail"}',
      { ...DEFAULT_OPTIONS, engine: "main-thread" }
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.stats.engine).toBe("main-thread");
    expect(outcome.stats.report.engine).toBe("main-thread");
  });
});

describe("computeReport — the row cap seam", () => {
  it("carries the parse-derived truncation forward instead of recomputing it", () => {
    const report = computeReport(binaryRows(3, 0, 0, 0), {
      ...DEFAULT_OPTIONS,
      truncated: true,
      rowCount: 12,
    });
    expect(report.n).toBe(3);
    expect(report.rowCount).toBe(12);
    expect(report.truncated).toBe(true);
  });
});
