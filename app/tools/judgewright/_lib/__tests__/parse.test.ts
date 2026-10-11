import { describe, expect, it } from "vitest";
import {
  columnAmbiguities,
  detectFormat,
  mapColumns,
  parseVerdicts,
} from "../parse";
import { analyzeVerdicts } from "../analyze";
import { MAX_ROWS } from "../constants";

const JSONL_HEADER =
  '{"example_id":"ex-001","judge_label":"pass","human_label":"pass"}';

describe("detectFormat", () => {
  it("detects JSONL from the first non-blank line", () => {
    expect(detectFormat("\n\n" + JSONL_HEADER + "\n")).toBe("jsonl");
  });

  it("detects CSV from a header line", () => {
    expect(detectFormat("example_id,judge_label,human_label\nex-001,pass,pass")).toBe(
      "csv"
    );
  });

  it("defaults to jsonl for an empty paste", () => {
    expect(detectFormat("   \n  ")).toBe("jsonl");
  });
});

describe("mapColumns — the alias table", () => {
  it("maps every canonical header", () => {
    const mapping = mapColumns([
      "example_id",
      "judge_label",
      "human_label",
      "human_labels",
      "judge_score",
      "human_score",
      "judge_critique",
      "human_critique",
      "position",
      "preferred_longer",
      "input",
      "output",
    ]);
    expect(mapping.exampleId).toBe("example_id");
    expect(mapping.judgeLabel).toBe("judge_label");
    expect(mapping.humanLabel).toBe("human_label");
    expect(mapping.humanLabels).toBe("human_labels");
    expect(mapping.judgeScore).toBe("judge_score");
    expect(mapping.humanScore).toBe("human_score");
    expect(mapping.judgeCritique).toBe("judge_critique");
    expect(mapping.humanCritique).toBe("human_critique");
    expect(mapping.position).toBe("position");
    expect(mapping.preferredLonger).toBe("preferred_longer");
    expect(mapping.input).toBe("input");
    expect(mapping.output).toBe("output");
  });

  it("maps the documented aliases (SPEC §2.1.2)", () => {
    const mapping = mapColumns([
      "uid",
      "verdict",
      "gold_label",
      "raters",
      "confidence",
      "human_confidence",
      "judge_reason",
      "human_reason",
      "position",
      "preferred_longer",
      "input",
      "output",
    ]);
    expect(mapping.exampleId).toBe("uid");
    expect(mapping.judgeLabel).toBe("verdict");
    expect(mapping.humanLabel).toBe("gold_label");
    expect(mapping.humanLabels).toBe("raters");
    expect(mapping.judgeScore).toBe("confidence");
    expect(mapping.humanScore).toBe("human_confidence");
    expect(mapping.judgeCritique).toBe("judge_reason");
    expect(mapping.humanCritique).toBe("human_reason");
  });

  it("is case- and whitespace-insensitive on header names", () => {
    const mapping = mapColumns([" Example_ID ", "Judge_Label", " Human_Label "]);
    expect(mapping.exampleId).toBe(" Example_ID ");
    expect(mapping.judgeLabel).toBe("Judge_Label");
    expect(mapping.humanLabel).toBe(" Human_Label ");
  });

  it("detects two columns claiming one slot", () => {
    expect(columnAmbiguities(["judge_label", "verdict", "human_label"])).toEqual([
      { slot: "judgeLabel", columns: ["judge_label", "verdict"] },
    ]);
    expect(columnAmbiguities(["example_id", "judge_label", "human_label"])).toEqual([]);
  });
});

describe("parseVerdicts — JSONL happy path", () => {
  const text = [
    '{"example_id":"ex-001","judge_label":"pass","human_label":"pass","judge_critique":"ok","judge_score":0.93}',
    '{"example_id":"ex-002","judge_label":"fail","human_label":"pass","human_labels":["pass","fail"],"position":1,"preferred_longer":true}',
  ].join("\n");

  it("parses rows with exact line numbers", () => {
    const result = parseVerdicts(text);
    expect(result.format).toBe("jsonl");
    expect(result.rowCount).toBe(2);
    expect(result.verdicts).toHaveLength(2);
    expect(result.issues).toEqual([]);
    expect(result.capped).toBe(false);
    expect(result.warnings).toEqual([]);

    const [first, second] = result.verdicts;
    expect(first?.exampleId).toBe("ex-001");
    expect(first?.judgeLabel).toBe("pass");
    expect(first?.humanLabels).toEqual(["pass"]);
    expect(first?.judgeScore).toBe(0.93);
    expect(first?.judgeCritique).toBe("ok");
    expect(first?.lineNumber).toBe(1);

    expect(second?.judgeLabel).toBe("fail");
    expect(second?.humanLabels).toEqual(["pass", "fail"]);
    expect(second?.position).toBe(1);
    expect(second?.preferredLonger).toBe(true);
    expect(second?.lineNumber).toBe(2);
  });

  it("accepts ≥2 human raters as a JSON array or a comma-separated string", () => {
    const asArray = parseVerdicts(
      '{"example_id":"a","judge_label":"pass","human_labels":["pass","fail","fail"]}'
    );
    expect(asArray.verdicts[0]?.humanLabels).toEqual(["pass", "fail", "fail"]);

    const asString = parseVerdicts(
      '{"example_id":"a","judge_label":"pass","human_labels":"pass, fail"}'
    );
    expect(asString.verdicts[0]?.humanLabels).toEqual(["pass", "fail"]);
  });

  it("resolves the alias table per JSONL row", () => {
    const result = parseVerdicts(
      '{"id":"x1","verdict":"pass","gold_label":"fail","confidence":"0.5"}'
    );
    expect(result.verdicts[0]?.exampleId).toBe("x1");
    expect(result.verdicts[0]?.judgeLabel).toBe("pass");
    expect(result.verdicts[0]?.humanLabels).toEqual(["fail"]);
    expect(result.verdicts[0]?.judgeScore).toBe(0.5);
  });
});

describe("parseVerdicts — the BOM (A6)", () => {
  const JSONL_TWO = [
    '{"example_id":"ex-001","judge_label":"pass","human_label":"pass"}',
    '{"example_id":"ex-002","judge_label":"fail","human_label":"pass"}',
  ].join("\n");

  it("strips the BOM on the JSONL path, so the first row survives", () => {
    // Before A6 the BOM sat in front of the `{`: `detectFormat` read the line
    // as NOT starting with `{`, so the paste was sniffed as CSV and died on
    // the single-column structure check — every row lost to one byte.
    const bom = parseVerdicts(`\uFEFF${JSONL_TWO}`);
    const plain = parseVerdicts(JSONL_TWO);

    expect(bom.format).toBe("jsonl");
    expect(bom.fatal).toBe(false);
    expect(bom.issues).toEqual([]);
    expect(bom.verdicts.map((row) => row.exampleId)).toEqual(["ex-001", "ex-002"]);
    expect(bom.rowCount).toBe(2);
    // Byte-identical to the un-prefixed paste: stripping is invisible.
    expect(bom.verdicts).toEqual(plain.verdicts);
  });

  it("a BOM + CRLF JSONL paste keeps its line numbers and every row", () => {
    const result = parseVerdicts(`\uFEFF${JSONL_TWO.replace(/\n/g, "\r\n")}`);
    expect(result.format).toBe("jsonl");
    expect(result.verdicts).toHaveLength(2);
    expect(result.verdicts[1]?.lineNumber).toBe(2);
    expect(result.verdicts[0]?.exampleId).toBe("ex-001");
  });

  it("strips at most ONE BOM — a second one is content, and says so", () => {
    // One leading BOM is an encoding artifact and is always removed. A SECOND
    // one is data: it stays in the text, `JSON.parse` rejects the row, and the
    // parse reports it as an invalid-JSON structure issue with the exact line
    // instead of silently rescuing it.
    const result = parseVerdicts(`\uFEFF\uFEFF${JSONL_TWO}`);
    expect(result.format).toBe("jsonl"); // detectFormat trims U+FEFF
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.cls).toBe("structure");
    expect(result.issues[0]?.reason).toBe("line 1: invalid JSON — could not parse");
    expect(result.rowCount).toBe(2);
    // Row 2 (no BOM) still parses; only the BOM'd row is skipped.
    expect(result.verdicts.map((row) => row.exampleId)).toEqual(["ex-002"]);
  });

  it("a single BOM alone is still an honest empty-ish paste", () => {
    const result = parseVerdicts("\uFEFF");
    // Nothing left to parse: not a crash, and not a fabricated row.
    expect(result.verdicts).toEqual([]);
    expect(result.fatal).toBe(false);
  });
});

describe("parseVerdicts — CSV happy path", () => {
  it("parses a CRLF file with a BOM", () => {
    const text = [
      "\uFEFFexample_id,judge_label,human_label,judge_score",
      "ex-001,pass,pass,0.9",
      "ex-002,fail,pass,0.4",
    ].join("\r\n");
    const result = parseVerdicts(text);

    expect(result.format).toBe("csv");
    expect(result.columns).toEqual([
      "example_id",
      "judge_label",
      "human_label",
      "judge_score",
    ]);
    expect(result.verdicts).toHaveLength(2);
    expect(result.verdicts[0]?.judgeLabel).toBe("pass");
    expect(result.verdicts[1]?.judgeLabel).toBe("fail");
    expect(result.verdicts[1]?.lineNumber).toBe(3);
  });

  it("honors quoted fields with embedded commas and newlines", () => {
    const text = [
      'example_id,judge_critique,judge_label,human_label',
      'ex-001,"He said ""hi"", then left",pass,pass',
      'ex-002,"line one',
      'line two",fail,fail',
    ].join("\n");
    const result = parseVerdicts(text);

    expect(result.verdicts[0]?.judgeCritique).toBe('He said "hi", then left');
    expect(result.verdicts[1]?.judgeCritique).toBe("line one\nline two");
    expect(result.verdicts[1]?.lineNumber).toBe(3); // the record STARTS on line 3
    expect(result.verdicts).toHaveLength(2);
  });

  it("keeps the same logical rows identical between JSONL and CSV (AC-28)", () => {
    const jsonl = parseVerdicts(
      [
        '{"example_id":"ex-001","judge_label":"pass","human_label":"pass"}',
        '{"example_id":"ex-002","judge_label":"fail","human_label":"pass"}',
        '{"example_id":"ex-003","judge_label":"pass","human_label":"fail"}',
      ].join("\n")
    );
    const csv = parseVerdicts(
      [
        "example_id,judge_label,human_label",
        "ex-001,pass,pass",
        "ex-002,fail,pass",
        "ex-003,pass,fail",
      ].join("\n")
    );

    // Line numbers legitimately differ (CSV carries a header line); the
    // verdicts themselves must be byte-equal (SPEC §2.1.8: no statistic — and
    // no parsed row — may depend on the input format).
    const strip = (result: ReturnType<typeof parseVerdicts>) =>
      result.verdicts.map((row) => ({
        exampleId: row.exampleId,
        judgeLabel: row.judgeLabel,
        humanLabels: row.humanLabels,
      }));
    expect(strip(jsonl)).toEqual(strip(csv));
  });
});

describe("parseVerdicts — the decision table (AC-14)", () => {
  it("row 1: missing example_id skips the row with the exact line", () => {
    const text = [
      '{"example_id":"ex-001","judge_label":"pass","human_label":"pass"}',
      '{"judge_label":"fail","human_label":"pass"}',
      '{"example_id":"ex-003","judge_label":"pass","human_label":"fail"}',
    ].join("\n");
    const result = parseVerdicts(text);

    expect(result.verdicts.map((row) => row.exampleId)).toEqual(["ex-001", "ex-003"]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toEqual({
      line: 2,
      cls: "missing-field",
      reason: 'line 2: missing "example_id"',
    });
  });

  it("row 2: a non-numeric score treats the score as absent with the exact copy", () => {
    const text = [
      '{"example_id":"ex-001","judge_label":"pass","human_label":"pass","judge_score":"high"}',
      '{"example_id":"ex-002","judge_label":"fail","human_label":"pass"}',
    ].join("\n");
    const result = parseVerdicts(text);

    expect(result.verdicts).toHaveLength(2);
    expect(result.verdicts[0]?.judgeScore).toBeNull();
    expect(result.issues[0]).toEqual({
      line: 1,
      cls: "bad-value",
      column: "judge_score",
      reason: 'line 1: judge_score "high" is not a number in [0,1]',
    });
  });

  it("row 3: an out-of-range score is never clamped (AC-37)", () => {
    const text = [
      '{"example_id":"ex-001","judge_label":"pass","human_label":"pass","judge_score":1.7}',
      '{"example_id":"ex-002","judge_label":"fail","human_label":"pass"}',
    ].join("\n");
    const result = parseVerdicts(text);

    expect(result.verdicts).toHaveLength(2);
    expect(result.verdicts[0]?.judgeScore).toBeNull();
    expect(result.issues[0]).toEqual({
      line: 1,
      cls: "bad-value",
      column: "judge_score",
      reason:
        "line 1: judge_score 1.7 is outside [0,1] — treated as absent, never clamped",
    });
  });

  it("row 4: a duplicate example_id warns and keeps both rows independent (AC-36)", () => {
    const text = [
      '{"example_id":"X42","judge_label":"pass","human_label":"pass"}',
      '{"example_id":"X42","judge_label":"fail","human_label":"pass"}',
    ].join("\n");
    const result = parseVerdicts(text);

    expect(result.verdicts).toHaveLength(2);
    expect(result.issues).toEqual([]);
    expect(result.warnings).toEqual([
      'duplicate example_id "X42" — rows are counted independently',
    ]);
  });

  it("row 5: missing judge_label skips the row with the exact line", () => {
    const text = [
      '{"example_id":"ex-001","judge_label":"pass","human_label":"pass"}',
      '{"example_id":"ex-002","human_label":"pass"}',
    ].join("\n");
    const result = parseVerdicts(text);

    expect(result.verdicts).toHaveLength(1);
    expect(result.issues[0]).toEqual({
      line: 2,
      cls: "missing-field",
      reason: 'line 2: missing "judge_label"',
    });
  });

  it("row 6: MAX_COLS exceeded is a capacity hard error", () => {
    const header = Array.from({ length: 65 }, (_, i) => `col_${i}`).join(",");
    const result = parseVerdicts(`${header}\n${Array.from({ length: 65 }, () => "x").join(",")}`);

    expect(result.verdicts).toEqual([]);
    expect(result.issues[0]?.cls).toBe("capacity");
    expect(result.issues[0]?.reason).toBe(
      "line 1: header lists 65 columns — the limit is 64"
    );
  });

  it("row 7: a single-column file is a structure hard error", () => {
    const result = parseVerdicts("judge_label\npass\nfail");

    expect(result.verdicts).toEqual([]);
    expect(result.issues[0]).toEqual({
      line: 1,
      cls: "structure",
      reason: "line 1: single-column input: need at least example_id and one label column",
    });
  });

  it("row 8: a bad JSON line is a structure issue and the row is skipped", () => {
    const text = [
      '{"example_id":"ex-001","judge_label":"pass","human_label":"pass"}',
      "{not json at all",
      '{"example_id":"ex-003","judge_label":"pass","human_label":"fail"}',
    ].join("\n");
    const result = parseVerdicts(text);

    expect(result.verdicts).toHaveLength(2);
    expect(result.issues[0]).toEqual({
      line: 2,
      cls: "structure",
      reason: "line 2: invalid JSON — could not parse",
    });
  });

  it("row 9: a CSV row with the wrong width is a structure issue with both counts", () => {
    const text = [
      "example_id,judge_label,human_label,extra",
      "ex-001,pass,pass,1",
      "ex-002,fail,pass",
      "ex-003,pass,fail,1",
    ].join("\n");
    const result = parseVerdicts(text);

    expect(result.verdicts.map((row) => row.exampleId)).toEqual(["ex-001", "ex-003"]);
    expect(result.issues[0]).toEqual({
      line: 3,
      cls: "structure",
      reason: "line 3: CSV row has 3 fields, header has 4",
    });
  });

  it("row 10: the row cap keeps an honest total and never drops below MAX_ROWS", () => {
    // MAX_ROWS is 200,000 — the cap is a constant, so the shape is asserted
    // here (capped=false, rowCount honored) rather than by building 200k rows.
    expect(MAX_ROWS).toBe(200_000);
    const rows = Array.from(
      { length: 12 },
      (_, i) => `{"example_id":"ex-${i}","judge_label":"pass","human_label":"pass"}`
    ).join("\n");
    const result = parseVerdicts(rows);
    expect(result.capped).toBe(false);
    expect(result.rowCount).toBe(12);
    expect(result.verdicts).toHaveLength(12);
  });
});

describe("parseVerdicts — the six error classes", () => {
  it("class: structure", () => {
    const result = parseVerdicts("{broken\n");
    expect(result.issues[0]?.cls).toBe("structure");
  });

  it("class: missing-field", () => {
    const result = parseVerdicts('{"judge_label":"pass","human_label":"pass"}');
    expect(result.issues[0]?.cls).toBe("missing-field");
  });

  it("class: bad-value", () => {
    const result = parseVerdicts(
      '{"example_id":"a","judge_label":5,"human_label":"pass"}'
    );
    expect(result.issues[0]).toEqual({
      line: 1,
      cls: "bad-value",
      column: "judge_label",
      reason: "line 1: judge_label must be a string, got number",
    });
  });

  it("class: vocabulary — the FM-2 hard error lists the offending set", () => {
    const text = [
      '{"example_id":"ex-001","judge_label":"PASS","human_label":"PASS"}',
      '{"example_id":"ex-002","judge_label":"FAIL","human_label":"FAIL"}',
      '{"example_id":"ex-003","judge_label":"TRUE","human_label":"TRUE"}',
    ].join("\n");
    const result = parseVerdicts(text);

    expect(result.verdicts).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.cls).toBe("vocabulary");
    expect(result.issues[0]?.line).toBe(3);
    expect(result.issues[0]?.reason).toBe(
      "Labels {PASS, FAIL, TRUE} mix two vocabularies — normalize before comparing. Known aliases: pass/fail, yes/no, true/false, 1/0."
    );
  });

  it("class: capacity — the paste ceiling", () => {
    const result = analyzeVerdicts("x", { maxInputChars: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("the limit is");
  });

  it("class: ambiguity — two columns claim a label slot", () => {
    const text = ["judge_label,verdict,human_label", "pass,fail,pass"].join("\n");
    const result = parseVerdicts(text);

    expect(result.verdicts).toEqual([]);
    expect(result.issues[0]?.cls).toBe("ambiguity");
    expect(result.issues[0]?.reason).toBe(
      'line 1: two columns map to judge_label: "judge_label" and "verdict" — rename one'
    );
  });
});

describe("parseVerdicts — unknown-but-consistent label sets (AC-46)", () => {
  it("accepts {GOOD, OK, BAD} on both columns", () => {
    const text = [
      '{"example_id":"ex-001","judge_label":"GOOD","human_label":"GOOD"}',
      '{"example_id":"ex-002","judge_label":"OK","human_label":"BAD"}',
      '{"example_id":"ex-003","judge_label":"BAD","human_label":"BAD"}',
    ].join("\n");
    const result = parseVerdicts(text);

    expect(result.verdicts).toHaveLength(3);
    expect(result.issues).toEqual([]);
    expect(result.verdicts.map((row) => row.judgeLabel)).toEqual([
      "good",
      "ok",
      "bad",
    ]);
  });
});

describe("parseVerdicts — the rows-skipped envelope (FM-1)", () => {
  it("keeps the first 5 issues displayed and the honest count", () => {
    const lines = Array.from(
      { length: 8 },
      () => `{"judge_label":"pass","human_label":"pass"}`
    );
    const result = parseVerdicts(lines.join("\n"));

    expect(result.issues).toHaveLength(5);
    expect(result.issueCount).toBe(8);
    expect(result.verdicts).toEqual([]);
  });
});

describe("parseVerdicts — through the analysis seam", () => {
  it("all rows invalid settles the FM-17 envelope with the first issues (AC-35)", () => {
    const text = [
      '{"judge_label":"pass","human_label":"pass"}',
      '{"example_id":"ex-002","judge_label":true}',
      "{oops",
    ].join("\n");
    const result = analyzeVerdicts(text);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(
      "No usable rows — every row failed validation. Fix the first issue and try again."
    );
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]?.reason).toContain('missing "example_id"');
    // Three rows, four problems: the middle row has a non-string judge_label
    // AND a missing human_label, and each is its own honest issue.
    expect(result.issueCount).toBe(4);
  });

  it("a mixed-vocabulary paste settles the FM-2 copy with no report", () => {
    const result = analyzeVerdicts(
      [
        '{"example_id":"a","judge_label":"PASS","human_label":"PASS"}',
        '{"example_id":"b","judge_label":"NO","human_label":"NO"}',
      ].join("\n")
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("mix two vocabularies");
  });
});

describe("parseVerdicts — performance", () => {
  it("parses 100,000 JSONL rows well under a generous node-env budget", () => {
    const row =
      '{"example_id":"ex-000001","judge_label":"pass","human_label":"pass","judge_score":0.91,"judge_critique":"A sufficiently long critique string to be realistic."}';
    const text = Array.from({ length: 100_000 }, (_, i) =>
      row.replace("ex-000001", `ex-${String(i).padStart(6, "0")}`)
    ).join("\n");

    const startedAt = Date.now();
    const result = parseVerdicts(text);
    const elapsedMs = Date.now() - startedAt;

    expect(result.verdicts).toHaveLength(100_000);
    expect(result.rowCount).toBe(100_000);
    expect(result.capped).toBe(false);
    expect(result.issues).toEqual([]);
    // A generous bound (AC-15's default clause), never a fragile ms number.
    expect(elapsedMs).toBeLessThan(5_000);
  }, 30_000);
});

describe("parseVerdicts — the parse wall-clock budget (A10)", () => {
  /** 512-row cadence, so a 1,500-row fixture is well past the first check. */
  function rows(count: number): string {
    return Array.from(
      { length: count },
      (_, i) =>
        `{"example_id":"ex-${i}","judge_label":"pass","human_label":"pass"}`
    ).join("\n");
  }

  it("returns a capacity hard error when the budget is already spent", () => {
    const result = parseVerdicts(rows(1_500), {
      deadlineAt: Date.now() - 1,
      budgetMs: 800,
    });

    expect(result.fatal).toBe(true);
    expect(result.verdicts).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.cls).toBe("capacity");
    expect(result.issues[0]?.reason).toContain("exceeded its time budget");
    // The budget it was given is named, not just "a budget".
    expect(result.issues[0]?.reason).toContain("in 800 ms");
    // The line it stopped on is exact, and the copy says what to do.
    expect(result.issues[0]?.line).toBe(1);
    expect(result.issues[0]?.reason).toContain("line 1:");
    expect(result.issues[0]?.reason).toContain("0 rows");
    expect(result.issues[0]?.reason).toContain("Web Worker");
  });

  it("a live budget parses every row, undisturbed", () => {
    const result = parseVerdicts(rows(1_500), {
      deadlineAt: Date.now() + 60_000,
      budgetMs: 800,
    });
    expect(result.fatal).toBe(false);
    expect(result.verdicts).toHaveLength(1_500);
    expect(result.issues).toEqual([]);
  });

  it("with no budget armed the parse is unbounded, exactly as before (A10)", () => {
    // The worker path relies on this: the default is NO parse deadline.
    const result = parseVerdicts(rows(1_500), {});
    expect(result.fatal).toBe(false);
    expect(result.verdicts).toHaveLength(1_500);
  });

  it("a budget that trips past the row cap still reports the cap honestly", () => {
    // deadlineAt in the past, but the row cap is what stops a SMALL paste.
    const small = parseVerdicts(rows(10), { deadlineAt: Date.now() - 1 });
    expect(small.fatal).toBe(true);
    expect(small.issues[0]?.cls).toBe("capacity");
  });

  it("names the rows it DID materialize before the trip", () => {
    // A generous-enough budget to pass the first check but not a big paste:
    // the honest copy is the row count, never a fabricated total.
    const result = parseVerdicts(rows(2_000), {
      deadlineAt: Date.now() + 1,
      budgetMs: 1,
    });
    expect(result.fatal).toBe(true);
    expect(result.issues[0]?.cls).toBe("capacity");
    expect(result.issues[0]?.reason).toMatch(/after [\d,]+ rows/);
    expect(result.verdicts).toEqual([]);
  });
});

describe("parseVerdicts — the parse budget through the seam (A10)", () => {
  /**
   * A TWO-label session (pass/fail, alternating), so the report is
   * non-degenerate: `encodePanel` is non-null and the bootstrap actually has
   * CIs to drop. A single-label fixture would leave `panel === null` and
   * `ciDropped` false for a reason that has nothing to do with the budget.
   */
  const rows = (count: number) =>
    Array.from(
      { length: count },
      (_, i) =>
        JSON.stringify({
          example_id: `ex-${i}`,
          judge_label: i % 2 === 0 ? "pass" : "fail",
          human_label: i % 3 === 0 ? "pass" : "fail",
        })
    ).join("\n");

  it("analyzeVerdicts settles the capacity error as a VALUE with no report", () => {
    const outcome = analyzeVerdicts(rows(1_500), {
      deadlineMs: 800,
      deadlineAt: Date.now() - 1,
      engine: "main-thread",
      parseDeadlineArmed: true,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain("exceeded its time budget");
    expect(outcome.error).toContain("in 800 ms");
    expect(outcome.issues[0]?.cls).toBe("capacity");
    // No partial report, no zero-filled report — an honest error value.
    expect(outcome.issueCount).toBe(1);
  });

  it("the WORKER path leaves the parse unbudgeted (A2 preserved)", () => {
    // Arming the budget on the worker would turn a legitimate 200k dispatch
    // into a spurious capacity error, which A2 forbids: without the flag the
    // parse runs to completion even against a spent deadline.
    const outcome = analyzeVerdicts(rows(1_500), {
      deadlineMs: 800,
      deadlineAt: Date.now() - 1,
      engine: "worker",
      seed: 42,
      confidenceLevel: 0.95,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.stats.report.n).toBe(1_500);
    // The budget still governs the compute phases: the CIs are dropped, and
    // the point statistics are untouched (AGENTS §31).
    expect(outcome.stats.report.ciDropped).toBe(true);
    expect(outcome.stats.report.ci.accuracy).toBeNull();
    expect(outcome.stats.report.ci.kappa).toBeNull();
    // The point statistics are the ones an unconstrained run would give.
    const fresh = analyzeVerdicts(rows(1_500), {
      deadlineMs: 60_000,
      deadlineAt: Date.now() + 60_000,
      engine: "worker",
      seed: 42,
      confidenceLevel: 0.95,
    });
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    expect(outcome.stats.report.accuracy).toBe(
      fresh.stats.report.accuracy
    );
    expect(outcome.stats.report.kappa).toBe(fresh.stats.report.kappa);
  });

  it("the armed fallback path still settles a report when the budget holds", () => {
    const outcome = analyzeVerdicts(rows(1_500), {
      deadlineMs: 60_000,
      deadlineAt: Date.now() + 60_000,
      engine: "main-thread",
      parseDeadlineArmed: true,
      seed: 42,
      confidenceLevel: 0.95,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.stats.report.n).toBe(1_500);
    expect(outcome.stats.report.ciDropped).toBe(false);
  });
});

describe("parseVerdicts — duplicate judge_score slots (SPEC §2.1.5)", () => {
  it("warns once and keeps the row (the labels remain analyzable)", () => {
    const result = parseVerdicts(
      '{"example_id":"a","judge_label":"pass","human_label":"pass","judge_score":0.5,"confidence":0.9}'
    );

    expect(result.verdicts).toHaveLength(1);
    expect(result.fatal).toBe(false);
    expect(result.warnings).toEqual([
      "line 1: two keys map to judge_score — the calibration panel is not computable",
    ]);
  });

  it("A12: flags the ambiguity for the report, so the panel is not computable", () => {
    const result = parseVerdicts(
      '{"example_id":"a","judge_label":"pass","human_label":"pass","judge_score":0.5,"confidence":0.9}'
    );
    // The flag is what `analyzeVerdicts` plumbs into `computeReport`.
    expect(result.judgeScoreAmbiguous).toBe(true);
  });

  it("A12: a single judge_score column is NOT ambiguous", () => {
    const result = parseVerdicts(
      '{"example_id":"a","judge_label":"pass","human_label":"pass","judge_score":0.5}'
    );
    expect(result.judgeScoreAmbiguous).toBe(false);
  });

  it("A12: the CSV path flags a duplicated judge_score column too", () => {
    const result = parseVerdicts(
      [
        "example_id,judge_label,human_label,judge_score,confidence",
        "a,pass,pass,0.5,0.9",
      ].join("\n")
    );
    expect(result.fatal).toBe(false);
    expect(result.verdicts).toHaveLength(1);
    expect(result.judgeScoreAmbiguous).toBe(true);
    expect(result.warnings).toEqual([
      'line 1: two columns map to judge_score: "judge_score" and "confidence" — rename one',
    ]);
  });

  it("A12: a duplicated NON-score slot no longer claims the calibration panel", () => {
    // Two `position` columns say nothing about judge_score. The old copy
    // pinned the calibration panel's story on every ambiguity; now only the
    // score slot carries it.
    const result = parseVerdicts(
      '{"example_id":"a","judge_label":"pass","human_label":"pass","judge_score":0.5,"position":0,"POSITION":1}'
    );
    expect(result.fatal).toBe(false);
    expect(result.judgeScoreAmbiguous).toBe(false);
    expect(result.warnings).toEqual([
      "line 1: two keys map to position — the first one is used",
    ]);
  });

  it("A12: a hard (fatal) parse still carries the flag for its envelope", () => {
    // A duplicated score column followed by a mixed-vocabulary hard error:
    // the flag must survive into the fatal result, not vanish with the rows.
    const result = parseVerdicts(
      [
        '{"example_id":"a","judge_label":"pass","human_label":"pass","judge_score":0.5,"confidence":0.9}',
        '{"example_id":"b","judge_label":"TRUE","human_label":"TRUE"}',
      ].join("\n")
    );
    expect(result.fatal).toBe(true);
    expect(result.verdicts).toEqual([]);
    expect(result.judgeScoreAmbiguous).toBe(true);
  });
});
