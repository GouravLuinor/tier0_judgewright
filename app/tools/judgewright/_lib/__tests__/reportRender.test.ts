import { describe, expect, it } from "vitest";
import {
  percent,
  renderMarkdownReport,
  renderOneLineVerdict,
  renderReceipt,
  sigFigs,
} from "../reportRender";
import { computeReport } from "../report";
import type { RawVerdict } from "../types";

function headlineRows(): RawVerdict[] {
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
  for (let i = 0; i < 920; i++) push("pos", "pos");
  for (let i = 0; i < 30; i++) push("neg", "pos");
  for (let i = 0; i < 20; i++) push("pos", "neg");
  for (let i = 0; i < 30; i++) push("neg", "neg");
  return rows;
}

const report = computeReport(headlineRows(), {
  seed: 42,
  confidenceLevel: 0.95,
  deadlineMs: 1_000,
  engine: "worker",
});

describe("sigFigs / percent", () => {
  it("prints 17 significant digits for non-integers", () => {
    expect(sigFigs(0.51923076923076927)).toBe("0.51923076923076927");
  });

  it("prints integers without a decimal tail", () => {
    expect(sigFigs(950)).toBe("950");
    expect(sigFigs(0)).toBe("0");
  });

  it("prints percentages at one decimal", () => {
    expect(percent(0.95)).toBe("95.0%");
    expect(percent(0.94)).toBe("94.0%");
    expect(percent(1)).toBe("100.0%");
  });
});

describe("renderOneLineVerdict", () => {
  it("carries n, accuracy, the 17-sig-fig κ and the always-majority baseline", () => {
    const line = renderOneLineVerdict(report);
    expect(line).toContain("1,000 rows");
    expect(line).toContain("acc 95.0%");
    expect(line).toContain("κ 0.51923076923076927");
    expect(line).toContain("always-majority 94.0%");
  });

  it("says κ is undefined instead of printing a fabricated number", () => {
    const degenerate = computeReport(
      [
        {
          exampleId: "a",
          judgeLabel: "pass",
          humanLabels: ["pass"],
          judgeScore: null,
          humanScore: null,
          judgeCritique: null,
          humanCritique: null,
          judgeInput: null,
          judgeOutput: null,
          position: null,
          preferredLonger: null,
          lineNumber: 1,
        },
      ],
      { seed: 42, confidenceLevel: 0.95, deadlineMs: 1_000, engine: "worker" }
    );
    const line = renderOneLineVerdict(degenerate);
    expect(line).toContain("κ undefined");
    expect(line).not.toContain("κ 0");
  });
});

describe("renderMarkdownReport — the copy payload", () => {
  const markdown = renderMarkdownReport(report);

  it("carries the headline figures", () => {
    expect(markdown).toContain("RAW AGREEMENT (accuracy): 95.0%");
    expect(markdown).toContain("UNWEIGHTED κ (chance-corrected): 0.51923076923076927");
    expect(markdown).toContain("Δκ deflation: 0.43076923076923068");
    expect(markdown).toContain(
      "CHANCE BASELINE (always-majority on this label distribution): 94.0%"
    );
  });

  it("prints the confusion matrix as a markdown table", () => {
    expect(markdown).toContain("| human \\ judge | neg | pos | total |");
    expect(markdown).toContain("| neg | 30 | 30 | 60 |");
    expect(markdown).toContain("| pos | 20 | 920 | 940 |");
  });

  it("prints the binary metrics with the positive class named", () => {
    expect(markdown).toContain('positive class "pos"');
    expect(markdown).toContain("TP 920");
  });

  it("carries the receipt and the no-transcendentals note", () => {
    expect(markdown).toContain("REPRODUCIBILITY RECEIPT");
    expect(markdown).toContain("no transcendentals");
  });
});

describe("renderReceipt — a reviewer can recompute κ from it alone", () => {
  const inputs = { n: 1000, a: 950, s: 896000, numerator: 54000, denominator: 104000 };
  const receipt = renderReceipt(report, inputs, {
    seed: 42,
    confidenceLevel: 0.95,
    deadlineMs: 1_000,
    deadlineHit: false,
  });

  it("prints the formula, n, A, S and the two products", () => {
    expect(receipt).toContain("κ = (A·n − S) / (n² − S)");
    expect(receipt).toContain("n = 1000");
    expect(receipt).toContain("A = 950");
    expect(receipt).toContain("S = 896000");
    expect(receipt).toContain("A·n − S = 54000");
    expect(receipt).toContain("n² − S = 104000");
  });

  it("prints the matrix a reviewer needs for the arithmetic", () => {
    expect(receipt).toContain("neg\t30\t30\t60");
    expect(receipt).toContain("pos\t20\t920\t940");
    expect(receipt).toContain("colTotals\t50\t950"); // judge marginals
  });

  it("carries the settings block and the engine", () => {
    expect(receipt).toContain("engine: worker");
    expect(receipt).toContain("seed 42");
    expect(receipt).toContain("confidence 0.95");
    expect(receipt).toContain("deadline 1000ms");
  });

  it("names the analytic baseline identity", () => {
    expect(receipt).toContain("p_o = p_e identity");
  });

  it("prints the undefined-κ receipt when the guard fired", () => {
    const receipt = renderReceipt(
      { ...report, kappa: null },
      null,
      { seed: 42, confidenceLevel: 0.95, deadlineMs: 1000, deadlineHit: false }
    );
    expect(receipt).toContain("κ: undefined");
  });
});
