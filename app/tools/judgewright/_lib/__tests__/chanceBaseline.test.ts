import { describe, expect, it } from "vitest";
import { chanceBaseline } from "../chanceBaseline";
import { cohensKappa } from "../cohensKappa";

/** A deterministic pseudo-random generator for the fixture builds below. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n human labels at `baseRate` positives; the judge always guesses the majority. */
function alwaysMajorityFixture(n: number, baseRate: number): {
  judge: string[];
  human: string[];
} {
  const positives = Math.round(n * baseRate);
  const human = [
    ...Array<string>(positives).fill("pass"),
    ...Array<string>(n - positives).fill("fail"),
  ];
  const majority = positives >= n - positives ? "pass" : "fail";
  return { judge: Array<string>(n).fill(majority), human };
}

describe("chanceBaseline — the largest human label share (AC-09)", () => {
  it("reports the majority class and its share", () => {
    const human = ["pass", "pass", "pass", "fail"];
    const baseline = chanceBaseline(["pass", "pass", "pass", "fail"], human);
    expect(baseline.majorityClass).toBe("pass");
    expect(baseline.baselineAgreement).toBe(0.75);
    expect(baseline.labelDistribution).toEqual({ pass: 0.75, fail: 0.25 });
  });

  it("normalizes labels before counting shares", () => {
    const human = ["PASS", "FAIL", "Yes", "no"];
    const baseline = chanceBaseline(["PASS", "FAIL", "Yes", "no"], human);
    // {pass: 1, fail: 1, yes: 1, no: 1} → each 0.25; first sorted wins the tie.
    expect(baseline.baselineAgreement).toBe(0.25);
    expect(baseline.labelDistribution).toEqual({
      pass: 0.25,
      fail: 0.25,
      yes: 0.25,
      no: 0.25,
    });
    expect(baseline.majorityClass).toBe("fail"); // sorted-first of the 4-way tie
  });

  it("the label distribution always sums to 1", () => {
    const baseline = chanceBaseline(
      ["a", "b", "a", "c", "c"],
      ["a", "b", "c", "c", "a"]
    );
    const total = Object.values(baseline.labelDistribution).reduce((sum, v) => sum + v, 0);
    expect(total).toBeCloseTo(1, 12);
  });
});

describe("chanceBaseline — the always-majority dummy has κ ≡ 0 (AC-09)", () => {
  // The identity is analytic: p_o = p_e for the constant-majority judge, so
  // κ = 0 exactly. Asserted across the pinned base rates at ±1e-15.
  for (const baseRate of [0.5, 0.7, 0.9, 0.95, 0.99]) {
    it(`baseline κ is exactly 0 at a ${baseRate} base rate`, () => {
      const { judge, human } = alwaysMajorityFixture(1000, baseRate);
      const baseline = chanceBaseline(judge, human);
      expect(baseline.baselineAgreement).toBeCloseTo(
        Math.max(baseRate, 1 - baseRate),
        12
      );
      expect(baseline.baselineKappa).toBe(0);
      expect(Math.abs(baseline.baselineKappa)).toBeLessThanOrEqual(1e-15);
    });
  }

  for (const baseRate of [0.05, 0.1, 0.25, 0.75, 0.99]) {
    it(`randomized label sets at base rate ${baseRate} keep the identity`, () => {
      const random = mulberry32(20260101 + Math.round(baseRate * 100));
      const n = 500;
      const positives = Math.round(n * baseRate);
      const human = [
        ...Array<string>(positives).fill("pass"),
        ...Array<string>(n - positives).fill("fail"),
      ];
      const majority = positives >= n - positives ? "pass" : "fail";
      const judge = human.map(() => majority);
      const baseline = chanceBaseline(judge, human);
      expect(baseline.baselineKappa).toBe(0);
      expect(Math.abs(baseline.baselineKappa)).toBeLessThanOrEqual(1e-15);
      // and the shared cohensKappa refuses the constant rater by design,
      // which is exactly why the identity is derived analytically.
      expect(cohensKappa(judge, human)).toBeNull();
      expect(random()).toBeGreaterThanOrEqual(0);
    });
  }

  it("holds for a multi-class distribution too", () => {
    const human = ["a", "a", "a", "b", "b", "c"];
    const judge = ["a", "a", "a", "a", "a", "a"]; // always-majority on a 3-class set
    const baseline = chanceBaseline(judge, human);
    expect(baseline.baselineAgreement).toBeCloseTo(0.5, 12);
    expect(baseline.baselineKappa).toBe(0);
  });

  it("a degenerate all-same-label session still reports the identity, not NaN", () => {
    const baseline = chanceBaseline(["pass", "pass"], ["pass", "pass"]);
    expect(baseline.baselineAgreement).toBe(1);
    expect(baseline.baselineKappa).toBe(0);
  });
});
