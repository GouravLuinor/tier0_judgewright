import { describe, expect, it } from "vitest";
import { computeReport, reportDisagreementWindow } from "../report";
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

describe("computeReport — the D2 seams are filled, the D3 ones stay typed", () => {
  const report = computeReport(headlineFixture(), DEFAULT_OPTIONS);

  it("fills α, the CIs, the grade and the disagreement rows", () => {
    expect(report.alphaPanel).not.toBeNull();
    expect(report.ci.accuracy).not.toBeNull();
    expect(report.ci.kappa).not.toBeNull();
    expect(report.ci.alpha).not.toBeNull();
    expect(report.grade).not.toBe("—");
    expect(report.kappaLinear).not.toBeNull();
    expect(report.kappaQuadratic).not.toBeNull();
    expect(report.disagreements).toHaveLength(1000);
    expect(report.bootstrapReplicates).toBe(2000); // the ≤50k tier
    expect(report.ciDropped).toBe(false);
  });

  it("fills the D3 panels HONESTLY — never fabricated (AC-48 / FM-3)", () => {
    // The headline fixture carries no judge_score, so ECE/Brier are null with a
    // reason (never 0), and neither bias column is present, so both bias
    // signals are null with the missing columns named.
    expect(report.calibration).not.toBeNull();
    expect(report.calibration?.computable).toBe(false);
    expect(report.calibration?.ece).toBeNull();
    expect(report.calibration?.brier).toBeNull();
    expect(report.calibration?.reason).toBe("not computable — no numeric scores");
    expect(report.calibration?.positiveClass).toBe("pos");
    expect(report.calibration?.scoreMode).toBe("p-positive");
    expect(report.bias.computable).toBe(false);
    expect(report.bias.positionBias).toBeNull();
    expect(report.bias.verbosityBias).toBeNull();
    expect(report.bias.missingColumns).toEqual(["position", "preferred_longer"]);
    expect(report.bias.note).toContain("Not computable from your input");
  });

  it("computes the human ceiling as null with one human rater (AC-34)", () => {
    expect(report.alphaHumans).toBeNull();
    expect(report.alphaWarning).toBeNull();
  });
});

describe("computeReport — the CIs are contract-complete (AC-52)", () => {
  const report = computeReport(headlineFixture(), DEFAULT_OPTIONS);

  it("every CI carries point, low, high, replicates and seed", () => {
    for (const ci of [report.ci.accuracy, report.ci.kappa, report.ci.alpha]) {
      expect(ci).not.toBeNull();
      if (ci === null) return;
      expect(ci.point).toBeGreaterThan(0);
      expect(ci.low).toBeLessThanOrEqual(ci.point);
      expect(ci.high).toBeGreaterThanOrEqual(ci.point);
      expect(ci.replicates).toBe(2000);
      expect(ci.seed).toBe(42);
    }
  });

  it("the point statistic of each CI is the report's own point statistic", () => {
    expect(report.ci.accuracy?.point).toBe(report.accuracy);
    expect(report.ci.kappa?.point).toBe(report.kappa);
    expect(report.ci.alpha?.point).toBe(report.alphaPanel);
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

    // Compare everything except the wall-clock field and the source LINE
    // numbers: JSONL row 4 is line 4 while the CSV row under a header is
    // line 5, and that honest difference is the point of the field.
    const withoutLineNumbers = (r: typeof fromJsonl) => ({
      ...r,
      disagreements: r.disagreements.map(({ lineNumber: _line, ...row }) => row),
    });
    const { executionTimeMs: _a, ...left } = withoutLineNumbers(fromJsonl);
    const { executionTimeMs: _b, ...right } = withoutLineNumbers(fromCsv);
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

/**
 * A3 — the TRUE full-set totals. The display window (what the store settles
 * and the export ships) is capped at MAX_TABLE_ROWS; these two fields carry
 * the whole-set figures so no window count can print as a total.
 */
describe("computeReport — the TRUE full-set totals (A3)", () => {
  it("agreementTotal/disagreementTotal count the FULL analyzed set, not the window", () => {
    const full = computeReport(headlineFixture(), DEFAULT_OPTIONS);
    // 950 agreements and 50 disagreements across all 1,000 rows.
    expect(full.agreementTotal).toBe(950);
    expect(full.disagreementTotal).toBe(50);
    expect(full.agreementTotal + full.disagreementTotal).toBe(full.n);

    // The windowed form (what the worker payload / store settles) keeps the
    // same totals while `disagreements` shrinks to the display cap.
    const windowed = reportDisagreementWindow(computeReport(headlineFixture(), DEFAULT_OPTIONS), 0, 2);
    expect(windowed.disagreements).toHaveLength(2);
    expect(windowed.agreementTotal).toBe(950);
    expect(windowed.disagreementTotal).toBe(50);
  });

  it("a k-class fixture's totals sum to n as well", () => {
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
    expect(report.n).toBe(6);
    expect(report.agreementTotal).toBe(3);
    expect(report.disagreementTotal).toBe(3);
  });
});

/**
 * A2 — the cooperative budget is an ABSOLUTE timestamp taken before the parse,
 * so a budget the parse already spent drops the CIs HONESTLY: the point
 * statistics settle, `ciDropped` is true, and no report is ever discarded.
 */
describe("computeReport — an already-spent budget drops CIs, never the report (A2)", () => {
  it("a deadlineAt in the past settles the point statistics with ciDropped", () => {
    const rows = headlineFixture();
    const spent = computeReport(rows, {
      ...DEFAULT_OPTIONS,
      deadlineAt: Date.now() - 1,
    });
    expect(spent.ci.accuracy).toBeNull();
    expect(spent.ci.kappa).toBeNull();
    expect(spent.ci.alpha).toBeNull();
    expect(spent.ciDropped).toBe(true);
    // The point statistics are byte-identical to the unconstrained run
    // (AGENTS §31: a deadline trip never changes a number).
    const full = computeReport(rows, DEFAULT_OPTIONS);
    expect(spent.n).toBe(full.n);
    expect(spent.accuracy).toBe(full.accuracy);
    expect(spent.kappa).toBe(full.kappa);
    expect(spent.agreementRows).toBe(full.agreementRows);
    expect(spent.baseline.baselineAgreement).toBe(full.baseline.baselineAgreement);
    expect(spent.bootstrapReplicates).toBe(full.bootstrapReplicates);
    // The receipt names the trip instead of claiming the replicates ran.
    expect(spent.receipt).toContain("ciDropped: true");
  });

  it("an unconstrained budget still computes every replicate", () => {
    const report = computeReport(headlineFixture(), {
      ...DEFAULT_OPTIONS,
      deadlineAt: Date.now() + 60_000,
    });
    expect(report.ci.accuracy).not.toBeNull();
    expect(report.ciDropped).toBe(false);
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
