import { describe, expect, it } from "vitest";
import { SAMPLE_RUBRIC, SAMPLE_VERDICTS } from "../presets";
import { MAX_INPUT_CHARS } from "../constants";

describe("seeded first run — never a blank instrument (BAR §2.3)", () => {
  it("ships a non-empty verdicts fixture", () => {
    expect(SAMPLE_VERDICTS.trim().length).toBeGreaterThan(0);
    expect(SAMPLE_VERDICTS.split("\n").length).toBeGreaterThanOrEqual(2);
  });

  it("ships every row as one parseable JSON object on its own line", () => {
    const lines = SAMPLE_VERDICTS.split("\n");
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("carries the required semantic slots on every row", () => {
    for (const line of SAMPLE_VERDICTS.split("\n")) {
      const row = JSON.parse(line) as Record<string, unknown>;
      expect(typeof row.example_id).toBe("string");
      expect(typeof row.judge_label).toBe("string");
      expect(typeof row.human_label).toBe("string");
    }
  });

  it("mixes agreements and disagreements so the report has signal", () => {
    const rows = SAMPLE_VERDICTS.split("\n").map(
      (line) => JSON.parse(line) as { judge_label: string; human_label: string }
    );
    const agree = rows.filter((r) => r.judge_label === r.human_label).length;
    const disagree = rows.length - agree;

    expect(agree).toBeGreaterThan(0);
    expect(disagree).toBeGreaterThan(0);
  });

  it("seeds a rubric the diagnosis milestone can read", () => {
    expect(SAMPLE_RUBRIC.trim().length).toBeGreaterThan(0);
  });

  it("keeps the seed inside the input cap", () => {
    expect(SAMPLE_VERDICTS.length).toBeLessThan(MAX_INPUT_CHARS);
  });
});

describe("demo sets — each one shows what it claims", () => {
  it("every set parses and settles a report", async () => {
    const { SAMPLE_SETS } = await import("../presets");
    const { analyzeVerdicts } = await import("../analyze");
    expect(SAMPLE_SETS.length).toBeGreaterThanOrEqual(4);
    for (const set of SAMPLE_SETS) {
      const result = analyzeVerdicts(set.verdicts, { seed: 42 });
      expect(result.ok, set.id).toBe(true);
    }
  });

  it("the skewed set has high raw agreement but a low κ", async () => {
    const { SAMPLE_SETS } = await import("../presets");
    const { analyzeVerdicts } = await import("../analyze");
    const set = SAMPLE_SETS.find((s) => s.id === "skewed");
    const result = analyzeVerdicts(set?.verdicts ?? "", { seed: 42 });
    if (!result.ok) throw new Error(result.error);
    expect(result.stats.report.rawAgreement).toBeCloseTo(0.9, 5);
    expect(result.stats.report.kappa ?? 1).toBeLessThan(0.4);
  });

  it("the three-way set is k-class and the pairwise set carries bias + calibration", async () => {
    const { SAMPLE_SETS } = await import("../presets");
    const { analyzeVerdicts } = await import("../analyze");
    const three = analyzeVerdicts(SAMPLE_SETS.find((s) => s.id === "three-way")?.verdicts ?? "", { seed: 42 });
    const pair = analyzeVerdicts(SAMPLE_SETS.find((s) => s.id === "pairwise")?.verdicts ?? "", { seed: 42 });
    if (!three.ok || !pair.ok) throw new Error("demo set failed to parse");
    expect(three.stats.report.labels).toHaveLength(3);
    expect(three.stats.report.kappaQuadratic).not.toBeNull();
    expect(pair.stats.report.bias.computable).toBe(true);
    expect(pair.stats.report.calibration?.computable).toBe(true);
  });
});
