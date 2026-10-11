import { describe, expect, it } from "vitest";
import {
  countBytes,
  countLines,
  countWords,
  analyzeVerdicts,
} from "../analyze";
import { DEFAULT_SEED, MAX_INPUT_CHARS } from "../constants";
import { SAMPLE_VERDICTS } from "../presets";

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

describe("analyzeVerdicts — the placeholder report", () => {
  it("returns ok stats with character, word, byte and line counts", () => {
    const result = analyzeVerdicts(JSONL);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.stats.characterCount).toBe(JSONL.length);
    expect(result.stats.wordCount).toBe(countWords(JSONL));
    expect(result.stats.byteCount).toBe(countBytes(JSONL));
    expect(result.stats.lineCount).toBe(2);
    expect(result.stats.engine).toBe("worker");
    expect(result.stats.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("echoes the analyzed text back to the pane verbatim", () => {
    const result = analyzeVerdicts(JSONL);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.stats.echo).toBe(JSONL);
    expect(result.stats.echoTruncated).toBe(false);
  });

  it("stamps the engine it ran on, so the fallback never lies", () => {
    const result = analyzeVerdicts(JSONL, { engine: "main-thread" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.engine).toBe("main-thread");
  });

  it("caps the echo at the echo limit and flags the truncation", () => {
    const result = analyzeVerdicts(JSONL, { echoLimitChars: 12 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.stats.echo).toBe(JSONL.slice(0, 12));
    expect(result.stats.echoTruncated).toBe(true);
    // The counts still describe the WHOLE paste, never the echo.
    expect(result.stats.characterCount).toBe(JSONL.length);
  });

  it("surfaces a capacity error as a value when the paste exceeds the cap", () => {
    const result = analyzeVerdicts("x", {
      maxInputChars: 0,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("the limit is");
    // The true size is disclosed, never silently clipped.
    expect(result.error).toContain("1");
  });

  it("treats the real MAX_INPUT_CHARS ceiling as far above any paste", () => {
    const result = analyzeVerdicts("x".repeat(MAX_INPUT_CHARS));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.characterCount).toBe(MAX_INPUT_CHARS);
  });

  it("never throws on an empty paste", () => {
    const result = analyzeVerdicts("");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.characterCount).toBe(0);
    expect(result.stats.wordCount).toBe(0);
    expect(result.stats.lineCount).toBe(0);
  });

  it("analyzes the seeded demo fixture on first paint", () => {
    const result = analyzeVerdicts(SAMPLE_VERDICTS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.stats.characterCount).toBe(SAMPLE_VERDICTS.length);
    expect(result.stats.lineCount).toBe(12); // one verdict row per line
    expect(result.stats.wordCount).toBeGreaterThan(50);
    // The seeded fixture is ASCII, so bytes and characters agree exactly.
    expect(result.stats.byteCount).toBe(result.stats.characterCount);
  });

  it("is deterministic — identical inputs settle identical stats", () => {
    const first = analyzeVerdicts(JSONL, { deadlineMs: 1_000 });
    const second = analyzeVerdicts(JSONL, { deadlineMs: 1_000 });

    expect(first).toEqual(second);
  });
});

describe("DEFAULT_SEED — persisted settings stay reproducible", () => {
  it("is a fixed integer the CI can rely on", () => {
    expect(Number.isInteger(DEFAULT_SEED)).toBe(true);
    expect(DEFAULT_SEED).toBe(42);
  });
});
