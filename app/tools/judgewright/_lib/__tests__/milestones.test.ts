/**
 * The AC-39 / AC-50 / AC-53 report-level proofs — the three acceptance items
 * that only exist once the whole card is on screen: the adjacent-error
 * fixture's unweighted-band grade, the κ-vs-α disclosure on one fixture, and
 * the tier copy. Kept in one file so the three read as one story.
 */

import { describe, expect, it } from "vitest";
import { computeReport } from "../report";
import { alphaBootstrapTier, bootstrapTierCopy } from "../bootstrapCI";
import {
  ALPHA_KAPPA_BANDS_NOTE,
  ALPHA_VS_KAPPA_DISCLOSURE,
} from "../krippendorffAlpha";
import { renderMarkdownReport, renderOneLineVerdict } from "../reportRender";
import { cohensKappa } from "../cohensKappa";
import { krippendorffAlpha } from "../krippendorffAlpha";
import type { RawVerdict } from "../types";

/** Reference tolerance: external references are asserted to ±1e-12 (SPEC §6). */
const TOL = 1e-12;

const DEFAULT_OPTIONS = {
  seed: 42,
  confidenceLevel: 0.95,
  deadlineMs: 1_000,
  engine: "worker" as const,
};

function rows(pairs: readonly (readonly [string, string])[]): RawVerdict[] {
  return pairs.map(([human, judge], i) => ({
    exampleId: `ex-${String(i + 1).padStart(4, "0")}`,
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
}

/**
 * AC-39: the adjacent-error fixture — 16 rows where the judge's two mistakes
 * are ONE rank off (human 2 vs judge 1, human 3 vs judge 2) instead of the
 * HEADLINE fixture's single-rank binary gap. The point of the fixture is that
 * its weighted κ is high while its unweighted κ is not.
 */
const ADJACENT_ROWS = rows([
  ...Array<readonly [string, string]>(4).fill(["1", "1"]),
  ...Array<readonly [string, string]>(1).fill(["2", "1"]),
  ...Array<readonly [string, string]>(1).fill(["3", "2"]),
  ...Array<readonly [string, string]>(10).fill(["3", "3"]),
]);

describe("AC-39 — the adjacent-error fixture", () => {
  const report = computeReport(ADJACENT_ROWS, DEFAULT_OPTIONS);
  const judge = ADJACENT_ROWS.map((row) => row.judgeLabel);
  const human = ADJACENT_ROWS.map((row) => row.humanLabels[0] as string);

  it("is 16 rows with 2 adjacent one-off errors and accuracy 0.875", () => {
    expect(report.n).toBe(16);
    expect(report.agreementRows).toBe(14);
    expect(report.accuracy).toBeCloseTo(0.875, 12);
    // The two mistakes are adjacent ranks, not gross: human 2 vs judge 1 and
    // human 3 vs judge 2 — one rank each.
    expect(report.confusion.matrix).toEqual([
      [4, 0, 0],
      [1, 0, 0],
      [0, 1, 10],
    ]);
  });

  it("the UNWEIGHTED κ is 0.744 and the weighted rows are the 1 − D₀/Dₑ references", () => {
    expect(Math.abs((report.kappa as number) - 0.744)).toBeLessThanOrEqual(TOL);
    expect(Math.abs((cohensKappa(judge, human, "linear") as number) - 0.8545454545454545)).toBeLessThanOrEqual(TOL);
    expect(Math.abs((cohensKappa(judge, human, "quadratic") as number) - 0.9219512195121952)).toBeLessThanOrEqual(TOL);
  });

  it("the Δκ deflation is exactly 0.131, computed from UNWEIGHTED κ", () => {
    expect(Math.abs((report.deflation as number) - 0.131)).toBeLessThanOrEqual(TOL);
    // 0.875 − 0.744 = 0.131: the deflation uses the unweighted coefficient,
    // never the weighted rows.
    expect(Math.abs(0.875 - (report.kappa as number) - 0.131)).toBeLessThanOrEqual(TOL);
  });

  it("bands on the UNWEIGHTED coefficient — B, not the linear-band A", () => {
    expect(report.grade).toBe("B");
    expect(report.gradeLabel).toBe("substantial");
    // The linear payment would have graded it A; the headline does not.
    const linearLetter = (cohensKappa(judge, human, "linear") as number) >= 0.8 ? "A" : "B";
    expect(linearLetter).toBe("A");
    expect(report.grade).not.toBe(linearLetter);
    expect(report.grade).toBe("B");
  });

  it("the α panel computes on the same fixture", () => {
    expect(report.alphaPanel).not.toBeNull();
    expect(report.ci.alpha).not.toBeNull();
  });
});

describe("AC-50 — κ and α pinned on the same fixture, with the disclosure", () => {
  const pairs = rows([
    ...Array<readonly [string, string]>(920).fill(["pos", "pos"]),
    ...Array<readonly [string, string]>(30).fill(["neg", "pos"]),
    ...Array<readonly [string, string]>(20).fill(["pos", "neg"]),
    ...Array<readonly [string, string]>(30).fill(["neg", "neg"]),
  ]);
  const report = computeReport(pairs, DEFAULT_OPTIONS);

  it("κ is 0.5192307692307692 and α is 0.5192400192400193 on the same 2×2", () => {
    expect(Math.abs((report.kappa as number) - 0.5192307692307692)).toBeLessThanOrEqual(TOL);
    expect(Math.abs((report.alphaPanel as number) - 0.5192400192400193)).toBeLessThanOrEqual(TOL);
    // Not the same number — and the copy says so.
    expect(report.kappa).not.toBe(report.alphaPanel);
  });

  it("the κ-vs-α disclosure is verbatim in the markdown and the α-bands note is named", () => {
    const markdown = renderMarkdownReport(report);
    expect(markdown).toContain(ALPHA_VS_KAPPA_DISCLOSURE);
    expect(markdown).toContain(ALPHA_KAPPA_BANDS_NOTE);
    expect(ALPHA_VS_KAPPA_DISCLOSURE).toBe(
      "with one human rater the panel is 2 coders, so this is Krippendorff's α (a chance-corrected coefficient), not Cohen's κ; the two differ by construction"
    );
  });

  it("the landmark receipt carries the α panel, the grade convention and the CI block", () => {
    expect(report.receipt).toContain(ALPHA_VS_KAPPA_DISCLOSURE);
    expect(report.receipt).toContain("Landis–Koch bands applied to unweighted κ");
    expect(report.receipt).toContain("seed 42");
    expect(report.receipt).toContain("B 2,000");
    expect(report.receipt).toContain("ciDropped: false");
    expect(report.receipt).toContain("reason: none");
  });

  it("the one-line verdict carries the CI bracket and the grade", () => {
    const line = renderOneLineVerdict(report);
    expect(line).toContain("κ 0.5192307692307692");
    expect(line).toContain("grade C");
    expect(line).toContain("always-majority 94.0%");
    // The CI bracket rides beside the coefficient — the AC-55 shape.
    expect(line).toContain("κ 0.51923076923076927");
    expect(line).toMatch(/κ 0\.51923076923076927 \[0\.\d+, 0\.\d+\]/);
  });

  it("shows the α CI on the same figure (the seeded bootstrap budgets both)", () => {
    expect(report.ci.kappa?.point).toBe(report.kappa);
    expect(report.ci.alpha?.point).toBe(report.alphaPanel);
    expect(report.alphaReplicates).toBe(2_000);
    expect(report.alphaBootstrapReplicates).toBe(2_000);
  });
});

describe("AC-53 — the tier copy", () => {
  it("prints the verbatim tier sentence with the live numbers", () => {
    expect(bootstrapTierCopy(200_000)).toBe(
      "B = 500 (tiered for ≤200k rows; a smaller dataset would get B = 2000)"
    );
  });

  it("carries the same tier copy in the receipt of a 200,000-row report", () => {
    // AC-53's exact synthetic: judge=pass, human=pass, 200,000 rows.
    const many = rows(
      Array.from({ length: 200_000 }, () => ["pass", "pass"] as const)
    );
    const report = computeReport(many, DEFAULT_OPTIONS);
    expect(report.n).toBe(200_000);
    expect(report.bootstrapReplicates).toBe(500);
    expect(report.kappa).toBeNull();
    expect(report.grade).toBe("—");
    expect(report.receipt).toContain(
      "B = 500 (tiered for ≤200k rows; a smaller dataset would get B = 2000)"
    );
    // The α-specific tier rule, asserted directly.
    expect(alphaBootstrapTier(200_000, 500)).toBe(250);
    expect(alphaBootstrapTier(50_000, 2_000)).toBe(2_000);
  });

  it("grades and receipts stay honest for a degenerate session (AC-29)", () => {
    const degenerate = rows([
      ...Array<readonly [string, string]>(3).fill(["pass", "pass"]),
      ...Array<readonly [string, string]>(2).fill(["fail", "pass"]),
    ]);
    const report = computeReport(degenerate, DEFAULT_OPTIONS);
    expect(report.kappa).toBeNull();
    expect(report.kappaLinear).toBeNull();
    expect(report.kappaQuadratic).toBeNull();
    expect(report.grade).toBe("—");
    expect(report.gradeLabel).toBe("");
    expect(report.deflation).toBeNull();
    expect(report.ci.kappa).toBeNull();
    // α IS defined over a constant judge: the panel is a panel, not a κ pair.
    expect(report.alphaPanel).not.toBeNull();
    expect(
      Math.abs((krippendorffAlpha(degenerate.map((row) => [row.judgeLabel, row.humanLabels[0] as string])).value as number) - (report.alphaPanel as number))
    ).toBeLessThanOrEqual(TOL);
  });
});
