import { describe, expect, it } from "vitest";
import { BIAS_NOT_COMPUTABLE_NOTE, biasMetrics } from "../biasMetrics.ts";
import type { RawVerdict } from "../types.ts";

function row(extra: Partial<RawVerdict> = {}): RawVerdict {
  return {
    exampleId: "ex",
    judgeLabel: "pos",
    humanLabels: ["pos"],
    judgeScore: null,
    humanScore: null,
    judgeCritique: null,
    humanCritique: null,
    judgeInput: null,
    judgeOutput: null,
    position: null,
    preferredLonger: null,
    lineNumber: 1,
    ...extra,
  };
}

describe("biasMetrics — computable when the column is present (AC-48)", () => {
  it("computes position bias as P(first slot) − 0.5 from a position column", () => {
    // 4 rows: 3 in the first slot, 1 in the second ⇒ P(first) = 0.75, bias = 0.25.
    const panel = biasMetrics([
      row({ position: 0 }),
      row({ position: 0 }),
      row({ position: 0 }),
      row({ position: 1 }),
    ]);
    expect(panel.computable).toBe(true);
    expect(panel.positionBias).toBeCloseTo(0.25, 12);
    expect(panel.positionN).toBe(4);
    // verbosity stays null (its column is absent) — never fabricated.
    expect(panel.verbosityBias).toBeNull();
    expect(panel.verbosityN).toBe(0);
    expect(panel.missingColumns).toEqual(["preferred_longer"]);
  });

  it("computes verbosity bias as P(prefers longer) − 0.5 from a preferred_longer column", () => {
    // 6 rows: 2 prefer the longer answer ⇒ P = 1/3, bias = 1/3 − 1/2 = −1/6.
    const panel = biasMetrics([
      row({ preferredLonger: true }),
      row({ preferredLonger: true }),
      row({ preferredLonger: false }),
      row({ preferredLonger: false }),
      row({ preferredLonger: false }),
      row({ preferredLonger: false }),
    ]);
    expect(panel.computable).toBe(true);
    expect(panel.verbosityBias).toBeCloseTo(-1 / 6, 12);
    expect(panel.verbosityN).toBe(6);
    expect(panel.positionBias).toBeNull();
    expect(panel.missingColumns).toEqual(["position"]);
  });

  it("computes both signals when both columns are present", () => {
    const panel = biasMetrics([
      row({ position: 0, preferredLonger: true }),
      row({ position: 1, preferredLonger: false }),
    ]);
    expect(panel.computable).toBe(true);
    expect(panel.positionBias).toBeCloseTo(0, 12); // P(first) = 0.5
    expect(panel.verbosityBias).toBeCloseTo(0, 12); // P(longer) = 0.5
    expect(panel.missingColumns).toEqual([]);
  });
});

describe("biasMetrics — the honest null when the column is absent (AC-48)", () => {
  it("returns null with both missing columns named and no fabricated number", () => {
    const panel = biasMetrics([row(), row(), row()]);
    expect(panel.computable).toBe(false);
    expect(panel.positionBias).toBeNull();
    expect(panel.verbosityBias).toBeNull();
    expect(panel.positionN).toBe(0);
    expect(panel.verbosityN).toBe(0);
    expect(panel.missingColumns).toEqual(["position", "preferred_longer"]);
    expect(panel.note).toBe(BIAS_NOT_COMPUTABLE_NOTE);
    expect(panel.note).toContain("Not computable from your input");
  });

  it("an empty input is not computable either — no division by zero", () => {
    const panel = biasMetrics([]);
    expect(panel.computable).toBe(false);
    expect(panel.positionBias).toBeNull();
    expect(panel.verbosityBias).toBeNull();
  });
});
