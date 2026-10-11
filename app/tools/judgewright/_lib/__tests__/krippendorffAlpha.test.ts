import { describe, expect, it } from "vitest";
import {
  ALPHA_CEILING_NEEDS_RATERS,
  ALPHA_INTERVAL_REASON,
  ALPHA_KAPPA_BANDS_NOTE,
  ALPHA_ORDINAL_FALLBACK_WARNING,
  ALPHA_UNDEFINED_COPY,
  ALPHA_VS_KAPPA_DISCLOSURE,
  alphaFromPairCounts,
  alphaReplicateContext,
  krippendorffAlpha,
} from "../krippendorffAlpha";

/** Reference tolerance: external references are asserted to ±1e-12 (SPEC §6). */
const TOL = 1e-12;

function near(value: number | null, expected: number): boolean {
  return value !== null && Math.abs(value - expected) <= TOL;
}

/**
 * The published 3-coder × 15-unit example (Krippendorff's α, the
 * "computational example" table: 3 coders, 15 units, 26 pairable values,
 * coincidence o11 6, o13 1, o22 4, o33 7, o34 2, o44 3).
 */
const WIKIPEDIA_UNITS: string[][] = [
  ["3"],
  [],
  ["2", "2"],
  ["1", "1"],
  ["3", "3"],
  ["3", "3", "4"],
  ["4", "4", "4"],
  ["1", "3"],
  ["2", "2"],
  ["1", "1"],
  ["1", "1"],
  ["3", "3"],
  ["3", "3"],
  [],
  ["3", "4"],
].filter((unit) => unit.length >= 2);

describe("krippendorffAlpha — the published worked example (AC-06/07)", () => {
  it("nominal α is 0.691358024691358 (= 1 − 75/243)", () => {
    const result = krippendorffAlpha(WIKIPEDIA_UNITS);
    expect(near(result.value, 0.691358024691358)).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.warning).toBeNull();
  });

  it("interval α is 0.8108448928121059 (= 1 − 12/63.44)", () => {
    const result = krippendorffAlpha(WIKIPEDIA_UNITS, "interval");
    expect(near(result.value, 0.8108448928121059)).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("26 pairable values over 12 pairable units", () => {
    const total = WIKIPEDIA_UNITS.reduce((sum, unit) => sum + unit.length, 0);
    expect(total).toBe(26);
    expect(WIKIPEDIA_UNITS).toHaveLength(12);
  });
});

describe("krippendorffAlpha — the guards (AC-43/45)", () => {
  it("interval α on non-numeric labels is null with the interval reason", () => {
    const result = krippendorffAlpha(
      [
        ["PASS", "PASS"],
        ["PASS", "FAIL"],
        ["FAIL", "FAIL"],
      ],
      "interval"
    );
    expect(result.value).toBeNull();
    expect(result.reason).toBe(ALPHA_INTERVAL_REASON);
    expect(result.reason).toBe("interval α needs numeric labels; use nominal");
  });

  it("ordinal α without numeric labels or labelOrder falls back to nominal WITH a warning", () => {
    const units = [
      ...Array<string[]>(3).fill(["LOW", "LOW"]),
      ...Array<string[]>(3).fill(["MID", "HIGH"]),
    ];
    const result = krippendorffAlpha(units, "ordinal");
    expect(result.warning).toBe(ALPHA_ORDINAL_FALLBACK_WARNING);
    expect(result.warning).toBe(
      "ordinal α needs numeric labels or an explicit labelOrder — falling back to nominal"
    );
    // The fallback VALUE is the nominal coefficient, not a silent ordinal one.
    const fallback = krippendorffAlpha(units).value;
    expect(result.value).toBe(fallback);
  });

  it("fewer than two coders on an example leaves that example unpairable", () => {
    expect(krippendorffAlpha([["a"], ["a"]]).reason).toBe(
      "α needs at least two coders on at least two examples."
    );
    expect(krippendorffAlpha([]).reason).toBe(
      "α needs at least two coders on at least two examples."
    );
  });

  it("a constant panel is undefined, not zero", () => {
    const result = krippendorffAlpha([
      ["PASS", "PASS"],
      ["PASS", "PASS"],
    ]);
    expect(result.value).toBeNull();
    expect(result.reason).toContain("no label variance to correct for");
  });
});

describe("krippendorffAlpha — the AC-08/44/45 fixture", () => {
  const FIXTURE = [
    ...Array<string[]>(3).fill(["1", "1"]),
    ...Array<string[]>(3).fill(["2", "3"]),
  ];

  it("nominal is 0.2666666666666666, interval 0.6666666666666666, ordinal 0.7962962962962963", () => {
    expect(near(krippendorffAlpha(FIXTURE).value, 0.2666666666666666)).toBe(true);
    expect(near(krippendorffAlpha(FIXTURE, "interval").value, 0.6666666666666666)).toBe(true);
    expect(near(krippendorffAlpha(FIXTURE, "ordinal").value, 0.7962962962962963)).toBe(true);
  });

  it("a perfectly agreeing panel is α = 1", () => {
    const perfect = [
      ["a", "a"],
      ["b", "b"],
      ["a", "a"],
      ["c", "c", "c"],
    ];
    expect(krippendorffAlpha(perfect).value).toBe(1);
    expect(krippendorffAlpha(perfect, "ordinal").value).toBe(1);
  });

  it("binary nominal ≡ ordinal bit-for-bit", () => {
    const binary = [
      ["a", "a"],
      ["b", "b"],
      ["a", "b"],
      ["b", "b"],
      ["a", "a"],
      ["b", "a"],
    ];
    expect(krippendorffAlpha(binary, "ordinal").value).toBe(
      krippendorffAlpha(binary).value
    );
  });

  it("ordinal is relabel-invariant for order-preserving relabels and an explicit labelOrder", () => {
    const numeric = [
      ...Array<string[]>(3).fill(["1", "1"]),
      ...Array<string[]>(3).fill(["2", "3"]),
    ];
    const tens = [
      ...Array<string[]>(3).fill(["10", "10"]),
      ...Array<string[]>(3).fill(["20", "30"]),
    ];
    const words = [
      ...Array<string[]>(3).fill(["LOW", "LOW"]),
      ...Array<string[]>(3).fill(["MID", "HIGH"]),
    ];
    expect(krippendorffAlpha(tens, "ordinal").value).toBe(
      krippendorffAlpha(numeric, "ordinal").value
    );
    expect(krippendorffAlpha(words, "ordinal", ["LOW", "MID", "HIGH"]).value).toBe(
      krippendorffAlpha(numeric, "ordinal").value
    );
    // 10 < 20 < 30 keeps the same order as 1 < 2 < 3: identical, not merely close.
    expect(krippendorffAlpha(tens, "ordinal").value).toBe(
      krippendorffAlpha(numeric, "ordinal").value
    );
  });
});

describe("krippendorffAlpha — the replicate path (the bootstrap contract)", () => {
  const FIXTURE = [
    ...Array<string[]>(3).fill(["1", "1"]),
    ...Array<string[]>(3).fill(["2", "3"]),
  ];

  it("α over the [judge, human] pair counts matches the panel computation", () => {
    const ctx = alphaReplicateContext(["1", "2", "3"], "nominal");
    expect(ctx).not.toBeNull();
    if (ctx === null) return;
    // counts[human * 3 + judge]: 3 units of (1,1), 3 units of (2,3).
    const counts = new Int32Array(9);
    counts[0 * 3 + 0] = 3;
    counts[1 * 3 + 2] = 3;
    expect(alphaFromPairCounts(counts, 3, ctx)).toBe(krippendorffAlpha(FIXTURE).value);
  });

  it("the replicate context is null when the level cannot be computed", () => {
    expect(alphaReplicateContext(["pass", "fail"], "interval")).toBeNull();
    expect(alphaReplicateContext(["pass", "fail"], "nominal")).not.toBeNull();
  });
});

describe("krippendorffAlpha — the disclosures (AC-34/AC-50)", () => {
  it("carries the mandatory κ-vs-α disclosure and the α-bands note", () => {
    expect(ALPHA_VS_KAPPA_DISCLOSURE).toBe(
      "with one human rater the panel is 2 coders, so this is Krippendorff's α (a chance-corrected coefficient), not Cohen's κ; the two differ by construction"
    );
    expect(ALPHA_KAPPA_BANDS_NOTE).toBe(
      "κ-bands applied to α for comparability — not α's own convention"
    );
    expect(ALPHA_CEILING_NEEDS_RATERS).toBe(
      "Human ceiling needs ≥2 human raters per example."
    );
  });
});

/**
 * A4 / AC-08: α is null with a reason — NEVER NaN. Extreme-but-finite numeric
 * labels (±1e155) make the interval δ² overflow `observed`/`expected` to
 * Infinity, and Inf/Inf is NaN; the guard turns that into an honest undefined
 * with the reason instead of a NaN floating into the report.
 */
describe("krippendorffAlpha — extreme labels never produce NaN (A4)", () => {
  const HUGE = "1e155";
  const TINY = "-1e155";

  it("interval α with ±1e155 labels is null with the undefined reason", () => {
    const units = [
      [HUGE, TINY],
      [TINY, HUGE],
      [HUGE, HUGE],
      [TINY, HUGE],
      [HUGE, TINY],
    ];
    const result = krippendorffAlpha(units, "interval");
    expect(result.value).toBeNull();
    expect(result.reason).toBe(ALPHA_UNDEFINED_COPY);
    expect(Number.isNaN(result.value)).toBe(false);
  });

  it("the same extreme labels are unambiguous at the nominal level (no overflow path)", () => {
    // Nominal δ is 1 regardless of magnitude, so the ratio stays finite and
    // the guard is not needed — the value is a real coefficient, not NaN.
    const units = [
      [HUGE, TINY],
      [TINY, HUGE],
      [HUGE, HUGE],
      [TINY, HUGE],
    ];
    const result = krippendorffAlpha(units);
    expect(Number.isNaN(result.value)).toBe(false);
    expect(result.value).not.toBeNull();
  });

  it("the bootstrap replicate path drops a non-finite α replicate instead of poisoning the percentile", () => {
    const ctx = alphaReplicateContext([HUGE, TINY], "interval");
    expect(ctx).not.toBeNull();
    if (ctx === null) return;
    // counts[human * 2 + judge] — every unit disagrees across the two classes.
    const counts = new Int32Array(4);
    counts[0 * 2 + 1] = 5; // human HUGE, judge TINY
    counts[1 * 2 + 0] = 5; // human TINY, judge HUGE
    expect(alphaFromPairCounts(counts, 2, ctx)).toBeNull();
  });
});
