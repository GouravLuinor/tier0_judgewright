import { describe, expect, it } from "vitest";
import {
  countBytes,
  countLines,
  countWords,
  analyzeVerdicts,
} from "../analyze";
import { DEFAULT_SEED, MAX_INPUT_CHARS, WORKER_DEADLINE_MS } from "../constants";
import { SAMPLE_VERDICTS } from "../presets";
import type { VerdictAnalysis } from "../types";

const JSONL = [
  '{"example_id":"ex-001","judge_label":"pass","human_label":"pass"}',
  '{"example_id":"ex-002","judge_label":"fail","human_label":"pass"}',
].join("\n");

describe("countBytes — UTF-8 honest units", () => {
  it("counts ASCII as one byte per character", () => {
    expect(countBytes("abc")).toBe(3);
  });

  it("counts multi-byte code points by their encoded length", () => {
    // e-acute is 2 bytes, kappa is 2 bytes, the euro sign is 3 bytes in UTF-8.
    expect(countBytes("\u00e9")).toBe(2);
    expect(countBytes("\u03ba")).toBe(2);
    expect(countBytes("\u20ac")).toBe(3);
    expect(countBytes("\u20ac\u00e9")).toBe(5);
  });

  it("counts an empty string as zero bytes", () => {
    expect(countBytes("")).toBe(0);
  });
});

describe("countWords — whitespace-delimited", () => {
  it("counts words across spaces, tabs and newlines", () => {
    expect(countWords("alpha beta\tgamma\ndelta")).toBe(4);
  });

  it("counts an all-whitespace paste as zero words", () => {
    expect(countWords("   \n\t ")).toBe(0);
    expect(countWords("")).toBe(0);
  });

  it("collapses repeated separators instead of counting empty tokens", () => {
    expect(countWords("  alpha   beta  ")).toBe(2);
  });
});

describe("countLines — trailing newline counted once", () => {
  it("counts lines without a trailing newline", () => {
    expect(countLines("a\nb\nc")).toBe(3);
  });

  it("counts a trailing newline as terminating the last line", () => {
    expect(countLines("a\nb\n")).toBe(3);
  });

  it("counts an empty paste as zero lines", () => {
    expect(countLines("")).toBe(0);
  });
});

describe("analyzeVerdicts — the settled D1 report", () => {
  it("returns ok stats with a full calibration report", () => {
    const result = analyzeVerdicts(JSONL);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { report, parse } = result.stats;
    expect(report.n).toBe(2);
    expect(report.accuracy).toBe(0.5);
    // The human column is constant on this two-row fixture, so the degenerate
    // guard fires: κ is null with a reason, never NaN and never 1 (AC-29).
    expect(report.kappa).toBeNull();
    expect(report.kappaUndefinedReason).toContain("no label variance");
    expect(parse.format).toBe("jsonl");
    expect(parse.rowCount).toBe(2);
    expect(parse.issues).toEqual([]);
    expect(result.stats.engine).toBe("worker");
  });

  it("computes a κ when both raters vary", () => {
    const result = analyzeVerdicts(
      [
        '{"example_id":"ex-001","judge_label":"pass","human_label":"pass"}',
        '{"example_id":"ex-002","judge_label":"fail","human_label":"fail"}',
        '{"example_id":"ex-003","judge_label":"pass","human_label":"fail"}',
      ].join("\n")
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Matrix rows=human [fail,pass]: fail=[1,1], pass=[0,1] ⇒ A=2, S=4, n=3:
    // agreement 2/3, κ = (2·3 − 4)/(3² − 4) = 2/5 = 0.4.
    expect(result.stats.report.n).toBe(3);
    expect(result.stats.report.accuracy).toBeCloseTo(2 / 3, 12);
    expect(result.stats.report.kappa).toBeCloseTo(0.4, 12);
    expect(result.stats.report.kappaUndefinedReason).toBeNull();
  });

  it("keeps the paste counts honest about the WHOLE paste", () => {
    const result = analyzeVerdicts(JSONL);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.characterCount).toBe(JSONL.length);
    expect(result.stats.lineCount).toBe(2);
    expect(result.stats.byteCount).toBe(countBytes(JSONL));
    expect(result.stats.wordCount).toBe(countWords(JSONL));
  });

  it("stamps the engine it ran on, so the fallback never lies", () => {
    const result = analyzeVerdicts(JSONL, { engine: "main-thread" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.engine).toBe("main-thread");
  });

  it("surfaces a capacity error as a value when the paste exceeds the cap", () => {
    const result = analyzeVerdicts("x", { maxInputChars: 0 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("the limit is");
    expect(result.error).toContain("1");
    expect(result.issues).toEqual([]);
  });

  it("treats the real MAX_INPUT_CHARS ceiling as far above any paste", () => {
    const row =
      '{"example_id":"a","judge_label":"pass","human_label":"pass"}';
    const result = analyzeVerdicts(row.repeat(1));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.characterCount).toBe(row.length);
  });

  it("never throws on an empty paste — it settles an error value", () => {
    const result = analyzeVerdicts("");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Nothing to analyze yet");
  });

  it("analyzes the seeded demo fixture on first paint", () => {
    const result = analyzeVerdicts(SAMPLE_VERDICTS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 12 rows, 9 agreements, 3 disagreements. Judge marginals 8 pass / 4
    // fail, human marginals 9 pass / 3 fail ⇒ A=9, S=84, κ=(108-84)/(144-84)=0.4.
    expect(result.stats.report.n).toBe(12);
    expect(result.stats.report.accuracy).toBeCloseTo(0.75, 12);
    expect(result.stats.report.kappa).toBeCloseTo(0.4, 12);
    expect(result.stats.report.baseline.baselineAgreement).toBeCloseTo(0.75, 12);
    // The deflation is visible: raw agreement overstates the κ by 0.35.
    expect(result.stats.report.deflation).toBeCloseTo(0.35, 12);
    expect(result.stats.characterCount).toBe(SAMPLE_VERDICTS.length);
    expect(result.stats.lineCount).toBe(12);
    // The seeded fixture is ASCII, so bytes and characters agree exactly.
    expect(result.stats.byteCount).toBe(result.stats.characterCount);
  });

  it("is deterministic — identical inputs settle identical reports", () => {
    const first = analyzeVerdicts(JSONL, { deadlineMs: WORKER_DEADLINE_MS });
    const second = analyzeVerdicts(JSONL, { deadlineMs: WORKER_DEADLINE_MS });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    // Strip the two wall-clock fields; everything else must match bit-for-bit.
    const strip = (analysis: VerdictAnalysis) => ({
      ...analysis,
      executionTimeMs: 0,
      report: { ...analysis.report, executionTimeMs: 0 },
    });
    expect(strip(first.stats)).toEqual(strip(second.stats));
  });

  it("carries partial-row issues alongside a computed report (FM-1)", () => {
    const text = [
      '{"example_id":"ex-001","judge_label":"pass","human_label":"pass"}',
      '{"judge_label":"fail","human_label":"pass"}',
    ].join("\n");
    const result = analyzeVerdicts(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.report.n).toBe(1);
    expect(result.stats.parse.issueCount).toBe(1);
    expect(result.stats.parse.issues[0]?.reason).toContain('missing "example_id"');
  });
});

describe("DEFAULT_SEED — persisted settings stay reproducible", () => {
  it("is a fixed integer the CI can rely on", () => {
    expect(Number.isInteger(DEFAULT_SEED)).toBe(true);
    expect(DEFAULT_SEED).toBe(42);
  });

  it("rides into the settled receipt", () => {
    const result = analyzeVerdicts(JSONL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.report.receipt).toContain(`seed ${DEFAULT_SEED}`);
  });
});

describe("MAX_INPUT_CHARS — the paste ceiling", () => {
  it("is a real ceiling, enforced as a value with the true size disclosed", () => {
    expect(MAX_INPUT_CHARS).toBeGreaterThan(1_000_000);
    // The ceiling is a constant; the seam enforces it as an error value that
    // names the true size instead of silently clipping.
    const result = analyzeVerdicts("x".repeat(64), { maxInputChars: 63 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("the limit is 63");
    expect(result.error).toContain("64");
  });
});
