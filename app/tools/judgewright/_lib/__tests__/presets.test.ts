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
