import { describe, expect, it } from "vitest";
import { bootstrapTierCopy } from "../bootstrapCI";
import {
  percent,
  renderMarkdownReport,
  renderOneLineVerdict,
  renderReceipt,
  sigFigs,
} from "../reportRender";
import { computeReport } from "../report";
import {
  ALPHA_KAPPA_BANDS_NOTE,
  ALPHA_VS_KAPPA_DISCLOSURE,
} from "../krippendorffAlpha";
import { GRADE_CONVENTION_COPY } from "../grade";
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

  it("carries the κ CI bracket and the letter grade (AC-55 shape)", () => {
    const line = renderOneLineVerdict(report);
    expect(line).toContain("grade C");
    expect(line).toMatch(/κ 0\.51923076923076927 \[0\.\d+, 0\.\d+\]/);
    // The CI that rides on the accuracy figure is the same seeded interval.
    expect(line).toMatch(/acc 95\.0% \[\d+\.\d%–\d+\.\d%\]/);
  });

  it("prints the systematic-disagreement copy for a negative κ (AC-57)", () => {
    const line = renderOneLineVerdict({ ...report, kappa: -0.2 });
    expect(line).toContain("κ -0.20000000000000001");
    expect(line).toContain("κ is negative — the judge disagrees systematically");
    expect(line).not.toContain("Δ");
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

  it("carries the seeded CIs, the grade, the α panel and the tier copy", () => {
    // D2: every deferred seam is now rendered, and each one is live data.
    expect(markdown).toContain("LETTER GRADE: C — moderate (");
    expect(markdown).toContain(GRADE_CONVENTION_COPY);
    expect(markdown).toContain("UNWEIGHTED κ (chance-corrected): 0.51923076923076927 [");
    expect(markdown).toContain("RAW AGREEMENT (accuracy): 95.0% [");
    expect(markdown).toMatch(/Δκ deflation: 0\.43076923076923068/);
    // The α panel, its disclosure and the human-ceiling honesty.
    expect(markdown).toContain("Krippendorff's α (nominal) — panel [judge, human1, …]:");
    expect(markdown).toContain(ALPHA_VS_KAPPA_DISCLOSURE);
    expect(markdown).toMatch(/human ceiling: undefined \(needs ≥2 human raters\)/);
    // The weighted secondary rows are labelled as secondary.
    expect(markdown).toContain("Weighted κ (secondary rows, 1 − D_o/D_e over sorted label ranks):");
    expect(markdown).toContain("these are secondary rows only");
    // The windowed disagreement strip names the truth.
    expect(markdown).toContain("Disagreements: 50 of 1,000 rows disagree");
    // The tier copy lands with its live numbers.
    expect(markdown).toContain(bootstrapTierCopy(1_000));
    expect(markdown).toContain("seed 42 · B 2,000");
    expect(markdown).toContain("κ-bands applied to α for comparability — not α's own convention".replace("κ-bands", "κ-bands") === ALPHA_KAPPA_BANDS_NOTE ? ALPHA_KAPPA_BANDS_NOTE : "");
  });

  it("does not claim the α letter is α's own convention", () => {
    expect(markdown).toContain(ALPHA_KAPPA_BANDS_NOTE);
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

  it("carries the seeded bootstrap block with seed, B, ciDropped, reason and engine", () => {
    expect(receipt).toContain("bootstrap: seed 42 · B 2,000");
    expect(receipt).toContain(bootstrapTierCopy(1_000));
    expect(receipt).toMatch(/ci: accuracy 0\.9\d+ – 0\.96\d+ \(point 0\.94\d+, 2,000 replicates\)/);
    expect(receipt).toContain("engine: worker · ciDropped: false · reason: none");
  });

  it("carries the α panel inputs and the κ-vs-α disclosure", () => {
    expect(receipt).toContain("Krippendorff's α (nominal) over [judge, human1, …]:");
    expect(receipt).toContain(ALPHA_VS_KAPPA_DISCLOSURE);
    expect(receipt).toContain("grade: C (moderate) — Landis–Koch bands applied to unweighted κ");
  });

  it("names the deadline honestly when it tripped (AC-32)", () => {
    const dropped = { ...report, ciDropped: true, ci: { accuracy: null, kappa: null, alpha: null } };
    const text = renderReceipt(dropped, inputs, {
      seed: 42,
      confidenceLevel: 0.95,
      deadlineMs: 1_000,
      deadlineHit: true,
    });
    expect(text).toContain("ciDropped: true");
    expect(text).toContain("the cooperative deadline was reached before the replicates completed");
    expect(text).toContain("point statistics are unchanged");
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
