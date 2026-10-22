import { describe, expect, it } from "vitest";
import { analyzeVerdicts } from "../analyze";
import {
  coef,
  interval,
  pct,
  pp,
  readVerdict,
  rowKey,
  scalePosition,
  wedgeSteps,
} from "../display";
import { SAMPLE_VERDICTS } from "../presets";
import type { CalibrationReport } from "../types";

function reportFor(text: string): CalibrationReport {
  const result = analyzeVerdicts(text, { seed: 42 });
  if (!result.ok) throw new Error(result.error);
  return result.stats.report;
}

function rows(pairs: [string, string][]): string {
  return pairs
    .map(([judge, human], i) =>
      JSON.stringify({ example_id: `r-${i}`, judge_label: judge, human_label: human })
    )
    .join("\n");
}

describe("screen formatting", () => {
  it("prints coefficients at two decimals, never float noise", () => {
    expect(coef(0.4000000000000001)).toBe("0.40");
    expect(coef(0.34999999999999998)).toBe("0.35");
    expect(coef(1)).toBe("1.00");
  });

  it("uses a true minus sign and never a signed zero", () => {
    expect(coef(-0.2)).toBe("−0.20");
    expect(coef(-0.001)).toBe("0.00");
    expect(pp(-0.05)).toBe("−5.0 pp");
  });

  it("prints a dash for missing values", () => {
    expect(coef(null)).toBe("—");
    expect(pct(undefined)).toBe("—");
    expect(coef(Number.NaN)).toBe("—");
  });

  it("reads an interval as words, not a dash that collides with the sign", () => {
    expect(interval(-0.2, 1)).toBe("−0.20 to 1.00");
  });

  it("maps the shared scale from −1…1 onto 0–100 and clamps", () => {
    expect(scalePosition(-1)).toBe(0);
    expect(scalePosition(0)).toBe(50);
    expect(scalePosition(1)).toBe(100);
    expect(scalePosition(3)).toBe(100);
  });

  it("draws the wedge as contiguous steps covering the whole scale", () => {
    const steps = wedgeSteps();
    expect(steps[0]?.from).toBe(-1);
    expect(steps[steps.length - 1]?.to).toBe(1);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]?.from).toBe(steps[i - 1]?.to);
    }
  });
});

describe("the plain-language verdict", () => {
  it("does not let the 12-row demo pass as trustworthy", () => {
    const reading = readVerdict(reportFor(SAMPLE_VERDICTS));
    expect(reading.tone).not.toBe("trust");
    expect(reading.headline.length).toBeGreaterThan(0);
  });

  it("calls out a judge riding a skewed label set", () => {
    // 90% raw agreement, but almost all of it is the majority label.
    const pairs: [string, string][] = [];
    for (let i = 0; i < 35; i++) pairs.push(["pass", "pass"]);
    pairs.push(["fail", "pass"]);
    for (let i = 0; i < 3; i++) pairs.push(["pass", "fail"]);
    pairs.push(["fail", "fail"]);
    const report = reportFor(rows(pairs));
    const reading = readVerdict(report);
    expect(report.rawAgreement).toBeCloseTo(0.9, 5);
    expect(reading.tone).not.toBe("trust");
    expect(reading.detail).toContain("flatters the judge");
  });

  it("trusts a judge that tracks humans on a large balanced set", () => {
    const pairs: [string, string][] = [];
    for (let i = 0; i < 200; i++) {
      const human = i % 2 === 0 ? "pass" : "fail";
      const judge = i % 25 === 0 ? (human === "pass" ? "fail" : "pass") : human;
      pairs.push([judge, human]);
    }
    expect(readVerdict(reportFor(rows(pairs))).tone).toBe("trust");
  });

  it("distrusts a judge that is systematically inverted", () => {
    const pairs: [string, string][] = [];
    for (let i = 0; i < 60; i++) {
      const human = i % 2 === 0 ? "pass" : "fail";
      pairs.push([i % 6 === 0 ? human : human === "pass" ? "fail" : "pass", human]);
    }
    expect(readVerdict(reportFor(rows(pairs))).tone).toBe("distrust");
  });

  it("says so when κ cannot be computed", () => {
    const pairs: [string, string][] = [["pass", "pass"], ["pass", "pass"], ["pass", "pass"]];
    expect(readVerdict(reportFor(rows(pairs))).tone).toBe("undefined");
  });
});

describe("row identity", () => {
  it("keys a row by its source line and id, so duplicate ids stay distinct", () => {
    expect(rowKey({ lineNumber: 3, exampleId: "ex-1" })).toBe("3-ex-1");
    expect(rowKey({ lineNumber: 4, exampleId: "ex-1" })).not.toBe(
      rowKey({ lineNumber: 3, exampleId: "ex-1" })
    );
  });
});
