import { describe, expect, it } from "vitest";
import {
  binaryMetrics,
  confusionMatrix,
  defaultPositiveClass,
  multiclassMetrics,
  sortedLabels,
} from "../confusionMatrix";

/**
 * The AC-51 fixture: human ACCEPTED/REJECTED 25/25 with the matrix
 * `[[20,5],[10,15]]` (rows = human).
 */
function ac51Fixture(): { judge: string[]; human: string[] } {
  const human = [
    ...Array<string>(25).fill("ACCEPTED"),
    ...Array<string>(25).fill("REJECTED"),
  ];
  const judge = [
    ...Array<string>(20).fill("ACCEPTED"),
    ...Array<string>(5).fill("REJECTED"),
    ...Array<string>(10).fill("ACCEPTED"),
    ...Array<string>(15).fill("REJECTED"),
  ];
  return { judge, human };
}

describe("sortedLabels", () => {
  it("returns the distinct labels of both raters, ascending", () => {
    expect(sortedLabels(["fail", "pass", "fail"], ["fail", "pass", "pass"])).toEqual([
      "fail",
      "pass",
    ]);
  });
});

describe("confusionMatrix", () => {
  it("builds the 2×2 with rows = human and cols = judge", () => {
    const { judge, human } = ac51Fixture();
    const matrix = confusionMatrix(judge, human);

    expect(matrix.labels).toEqual(["ACCEPTED", "REJECTED"]);
    expect(matrix.matrix).toEqual([
      [20, 5],
      [10, 15],
    ]);
    expect(matrix.rowTotals).toEqual([25, 25]);
    expect(matrix.colTotals).toEqual([30, 20]);
  });

  it("counts cells for a k-class set", () => {
    const judge = ["a", "b", "c", "a", "b", "c"];
    const human = ["a", "b", "c", "a", "b", "c"];
    const matrix = confusionMatrix(judge, human);
    expect(matrix.labels).toEqual(["a", "b", "c"]);
    expect(matrix.matrix).toEqual([
      [2, 0, 0],
      [0, 2, 0],
      [0, 0, 2],
    ]);
    expect(matrix.rowTotals).toEqual([2, 2, 2]);
  });

  it("handles an empty session without inventing labels", () => {
    const matrix = confusionMatrix([], []);
    expect(matrix.labels).toEqual([]);
    expect(matrix.matrix).toEqual([]);
    expect(matrix.rowTotals).toEqual([]);
  });
});

describe("defaultPositiveClass — the documented default", () => {
  it("is the second sorted label", () => {
    const { judge, human } = ac51Fixture();
    expect(defaultPositiveClass(judge, human)).toBe("REJECTED");
  });

  it("is null when there is no second label", () => {
    expect(defaultPositiveClass(["pass", "pass"], ["pass", "pass"])).toBeNull();
  });
});

describe("binaryMetrics — the known 2×2", () => {
  it("computes TP/FP/TN/FN and TPR/TNR/PPV/FPR/F1 against the second sorted label", () => {
    const { judge, human } = ac51Fixture();
    const metrics = binaryMetrics(judge, human, "REJECTED");

    expect(metrics.positiveClass).toBe("REJECTED");
    expect(metrics.tp).toBe(15);
    expect(metrics.fp).toBe(5);
    expect(metrics.tn).toBe(20);
    expect(metrics.fn).toBe(10);
    expect(metrics.tpr).toBeCloseTo(0.6, 12);
    expect(metrics.tnr).toBeCloseTo(0.8, 12);
    expect(metrics.ppv).toBeCloseTo(0.75, 12);
    expect(metrics.fpr).toBeCloseTo(0.2, 12);
    expect(metrics.f1).toBeCloseTo(0.6666666666666666, 12);
  });

  it("AC-51: switching the positive class flips the measured rates", () => {
    const { judge, human } = ac51Fixture();
    const flipped = binaryMetrics(judge, human, "ACCEPTED");

    expect(flipped.tp).toBe(20);
    expect(flipped.fp).toBe(10);
    expect(flipped.tn).toBe(15);
    expect(flipped.fn).toBe(5);
    expect(flipped.tpr).toBeCloseTo(0.8, 12);
    expect(flipped.ppv).toBeCloseTo(0.6666666666666666, 12);
  });

  it("returns null rates — never NaN — when a denominator is zero", () => {
    // The judge never emits the positive class: precision is undefined.
    const judge = ["neg", "neg", "neg", "neg"];
    const human = ["neg", "neg", "pos", "pos"];
    const metrics = binaryMetrics(judge, human, "pos");
    // The judge never emits "pos": precision is undefined (null), but recall
    // is a measured 0 — not a null.
    expect(metrics.ppv).toBeNull();
    expect(metrics.tpr).toBe(0);
    expect(metrics.f1).toBe(0);
    expect(Number.isNaN(metrics.tpr as number)).toBe(false);
    expect(metrics.tnr).toBe(1);
  });

  it("measures a never-emitted positive class as all-null rates", () => {
    const judge = ["a", "a", "a"];
    const human = ["a", "a", "a"];
    const metrics = binaryMetrics(judge, human, "b");
    expect(metrics.tp).toBe(0);
    expect(metrics.fp).toBe(0);
    expect(metrics.tn).toBe(0);
    expect(metrics.fn).toBe(0);
    for (const rate of [metrics.tpr, metrics.tnr, metrics.ppv, metrics.fpr, metrics.f1]) {
      expect(rate).toBeNull();
    }
  });
});

describe("multiclassMetrics", () => {
  it("computes per-label precision/recall/F1 plus the macro averages", () => {
    const judge = ["a", "a", "b", "b", "c"];
    const human = ["a", "b", "b", "c", "c"];
    const matrix = confusionMatrix(judge, human);
    const metrics = multiclassMetrics(matrix);

    const a = metrics.perLabel.find((entry) => entry.label === "a");
    const b = metrics.perLabel.find((entry) => entry.label === "b");
    const c = metrics.perLabel.find((entry) => entry.label === "c");

    // judge: a,a,b,b,c · human: a,b,b,c,c — column a holds 2 predictions, 1 right.
    expect(a).toEqual({ label: "a", precision: 0.5, recall: 1, f1: 2 / 3, support: 1 });
    expect(b).toEqual({ label: "b", precision: 0.5, recall: 0.5, f1: 0.5, support: 2 });
    expect(c).toEqual({ label: "c", precision: 1, recall: 0.5, f1: 2 / 3, support: 2 });
    expect(metrics.macroPrecision).toBeCloseTo((0.5 + 0.5 + 1) / 3, 12);
    expect(metrics.macroRecall).toBeCloseTo((1 + 0.5 + 0.5) / 3, 12);
    expect(metrics.macroF1).toBeCloseTo((2 / 3 + 0.5 + 2 / 3) / 3, 12);
  });

  it("returns null macro averages for an empty matrix", () => {
    const matrix = confusionMatrix([], []);
    const metrics = multiclassMetrics(matrix);
    expect(metrics.perLabel).toEqual([]);
    expect(metrics.macroF1).toBeNull();
    expect(metrics.macroPrecision).toBeNull();
    expect(metrics.macroRecall).toBeNull();
  });
});
