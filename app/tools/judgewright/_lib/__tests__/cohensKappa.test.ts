import { describe, expect, it } from "vitest";
import {
  KAPPA_UNDEFINED_COPY,
  cohensKappa,
  kappaReceiptInputs,
  kappaUndefinedReason,
} from "../cohensKappa";

/** Reference tolerance: external references are asserted to ±1e-12 (SPEC §6). */
const TOL = 1e-12;

describe("cohensKappa — reference values (AC-01…AC-04)", () => {
  it("AC-01: the canonical 2×2 (a=20,b=5,c=10,d=15; p_o=0.70, p_e=0.50) equals 0.4", () => {
    // 25 human-positive rows, 25 human-negative; judge 20/5 then 10/15.
    const human = [
      ...Array<string>(25).fill("pos"),
      ...Array<string>(25).fill("neg"),
    ];
    const judge = [
      ...Array<string>(20).fill("pos"),
      ...Array<string>(5).fill("neg"),
      ...Array<string>(10).fill("pos"),
      ...Array<string>(15).fill("neg"),
    ];
    const kappa = cohensKappa(judge, human);
    expect(kappa).not.toBeNull();
    expect(kappa as number).toBeCloseTo(0.4, 12);
    expect(Math.abs((kappa as number) - 0.4)).toBeLessThanOrEqual(TOL);
  });

  it("AC-02: the hand-computed 2×2 (a=12,b=3,c=2,d=3; p_o=0.75, p_e=0.60) equals 0.375", () => {
    const human = [...Array<string>(15).fill("pos"), ...Array<string>(5).fill("neg")];
    const judge = [
      ...Array<string>(12).fill("pos"),
      ...Array<string>(3).fill("neg"),
      ...Array<string>(2).fill("pos"),
      ...Array<string>(3).fill("neg"),
    ];
    const kappa = cohensKappa(judge, human);
    expect(kappa).not.toBeNull();
    expect(Math.abs((kappa as number) - 0.375)).toBeLessThanOrEqual(TOL);
  });

  it("AC-03: perfect agreement equals exactly 1", () => {
    const labels = ["a", "b", "c", "a", "c", "b", "a", "a", "c"];
    expect(cohensKappa(labels, labels)).toBe(1);
  });

  it("AC-03: the constructed chance-agreement matrix equals exactly 0", () => {
    // 100 items, both raters 50/50, observed agreement == expected agreement.
    const human = [...Array<string>(50).fill("pos"), ...Array<string>(50).fill("neg")];
    const judge = [
      ...Array<string>(25).fill("pos"),
      ...Array<string>(25).fill("neg"),
      ...Array<string>(25).fill("neg"),
      ...Array<string>(25).fill("pos"),
    ];
    const kappa = cohensKappa(judge, human);
    expect(kappa).toBe(0);
    expect(Math.abs(kappa as number)).toBeLessThanOrEqual(1e-15);
  });

  it("AC-04: the multiclass example equals 0.4285714285714286", () => {
    const human = ["2", "0", "2", "2", "0", "1"];
    const judge = ["0", "0", "2", "2", "0", "2"];
    const kappa = cohensKappa(judge, human);
    expect(kappa).not.toBeNull();
    expect(Math.abs((kappa as number) - 0.4285714285714286)).toBeLessThanOrEqual(TOL);
  });

  it("matches the integer-rational fast form bit-for-bit on the same data", () => {
    const human = ["a", "a", "b", "b", "c", "c", "c"];
    const judge = ["a", "b", "b", "b", "c", "a", "c"];
    const inputs = kappaReceiptInputs(judge, human);
    expect(inputs).not.toBeNull();
    if (!inputs) return;
    expect(cohensKappa(judge, human)).toBe(inputs.numerator / inputs.denominator);
  });
});

describe("cohensKappa — the single degenerate guard (AC-42)", () => {
  it("returns null for the constant-both-raters case [PASS,PASS]/[PASS,PASS]", () => {
    expect(cohensKappa(["PASS", "PASS"], ["PASS", "PASS"])).toBeNull();
    expect(kappaUndefinedReason(["PASS", "PASS"], ["PASS", "PASS"])).not.toBeNull();
  });

  it("returns null for the one-constant-rater case [PASS,FAIL]/[PASS,PASS]", () => {
    expect(cohensKappa(["PASS", "FAIL"], ["PASS", "PASS"])).toBeNull();
  });

  it("returns null for [PASS,PASS]/[PASS,FAIL] (either rater constant)", () => {
    expect(cohensKappa(["PASS", "PASS"], ["PASS", "FAIL"])).toBeNull();
  });

  it("never returns NaN and never returns 1 on degenerate input", () => {
    const degenerate = cohensKappa(["x", "x", "x"], ["x", "x", "x"]);
    expect(degenerate).toBeNull();
    expect(Number.isNaN(degenerate)).toBe(false);
    expect(degenerate).not.toBe(1);
  });

  it("carries the FM-4 reason copy and clears it for a defined κ", () => {
    expect(kappaUndefinedReason(["PASS", "PASS"], ["PASS", "FAIL"])).toBe(
      KAPPA_UNDEFINED_COPY
    );
    expect(kappaUndefinedReason(["PASS", "FAIL"], ["PASS", "FAIL"])).toBeNull();
  });

  it("returns null for an empty session rather than dividing by zero", () => {
    expect(cohensKappa([], [])).toBeNull();
  });
});

describe("kappaReceiptInputs — the recompute-by-hand inputs", () => {
  it("exposes n, A, S and the two products for the canonical 2×2", () => {
    const human = [...Array<string>(25).fill("pos"), ...Array<string>(25).fill("neg")];
    const judge = [
      ...Array<string>(20).fill("pos"),
      ...Array<string>(5).fill("neg"),
      ...Array<string>(10).fill("pos"),
      ...Array<string>(15).fill("neg"),
    ];
    const inputs = kappaReceiptInputs(judge, human);
    expect(inputs).toEqual({ n: 50, a: 35, s: 1250, numerator: 500, denominator: 1250 });
  });

  it("is null for a degenerate session (the guard runs first)", () => {
    expect(kappaReceiptInputs(["PASS", "PASS"], ["PASS", "PASS"])).toBeNull();
  });
});

describe("cohensKappa — the weights seam", () => {
  it("takes the integer fast path for the default (unweighted) case", () => {
    const human = ["a", "b", "a", "b"];
    const judge = ["a", "b", "b", "a"];
    expect(cohensKappa(judge, human)).toBe(cohensKappa(judge, human, "unweighted"));
  });

  it("returns null for weighted variants until the D2 rows land (never a wrong number)", () => {
    const human = ["a", "b", "a", "b"];
    const judge = ["a", "b", "b", "a"];
    expect(cohensKappa(judge, human, "linear")).toBeNull();
    expect(cohensKappa(judge, human, "quadratic")).toBeNull();
  });
});
