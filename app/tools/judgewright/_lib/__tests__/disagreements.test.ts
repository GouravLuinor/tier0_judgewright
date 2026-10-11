import { describe, expect, it } from "vitest";
import {
  buildDisagreementRows,
  disagreementWindowAt,
  selectDiagnosisDisagreements,
} from "../disagreements";
import { confusionMatrix } from "../confusionMatrix";
import {
  DIAGNOSIS_DISAGREEMENT_LIMIT,
  DIAGNOSIS_SELECTION_COPY,
} from "../constants";
import type { RawVerdict } from "../types";

function row(
  exampleId: string,
  human: string,
  judge: string,
  lineNumber: number,
  extra: Partial<RawVerdict> = {}
): RawVerdict {
  return {
    exampleId,
    judgeLabel: judge,
    humanLabels: [human],
    judgeScore: null,
    humanScore: null,
    judgeCritique: null,
    humanCritique: null,
    judgeInput: null,
    judgeOutput: null,
    position: null,
    preferredLonger: null,
    lineNumber,
    ...extra,
  };
}

/** 6 rows: 2 agree, 4 disagree across three confusion cells. */
const ROWS: RawVerdict[] = [
  row("ex-1", "pos", "pos", 1),
  row("ex-2", "pos", "neg", 2),
  row("ex-3", "pos", "neg", 3),
  row("ex-4", "neg", "pos", 4),
  row("ex-5", "neg", "neg", 5),
  row("ex-6", "fail", "pass", 6), // hmm: two vocabularies — no, this is a core-level fixture
];

describe("buildDisagreementRows", () => {
  it("builds one row per example with the agree flag and the line number", () => {
    const rows = buildDisagreementRows(ROWS);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({
      exampleId: "ex-1",
      humanLabel: "pos",
      judgeLabel: "pos",
      agree: true,
      lineNumber: 1,
    });
    expect(rows[1]?.agree).toBe(false);
    expect(rows[4]?.agree).toBe(true);
    // The critique and score passthrough is verbatim, never coerced.
    expect(buildDisagreementRows([row("a", "pos", "neg", 7, { judgeCritique: "no code", judgeScore: 0.5 })])[0])
      .toMatchObject({ judgeCritique: "no code", judgeScore: 0.5, humanCritique: null });
  });

  it("keeps the FIRST human label as the display label and all raters alongside", () => {
    const multi = buildDisagreementRows([
      row("m", "ok", "bad", 1, { humanLabels: ["ok", "good"] }),
    ]);
    expect(multi[0]?.humanLabel).toBe("ok");
    expect(multi[0]?.humanLabels).toEqual(["ok", "good"]);
  });
});

describe("disagreementWindowAt — the honest window", () => {
  const rows = buildDisagreementRows(ROWS);

  it("returns limit rows from offset plus the true total", () => {
    const window = disagreementWindowAt(rows, 2, 3);
    expect(window.offset).toBe(2);
    expect(window.rows.map((r) => r.exampleId)).toEqual(["ex-3", "ex-4", "ex-5"]);
    expect(window.totalCount).toBe(6);
  });

  it("clamps offset and limit instead of inventing rows", () => {
    expect(disagreementWindowAt(rows, 99, 10).rows).toEqual([]);
    expect(disagreementWindowAt(rows, -5, 4).rows.map((r) => r.exampleId)).toEqual([
      "ex-1",
      "ex-2",
      "ex-3",
      "ex-4",
    ]);
  });

  it("copies rows so a consumer cannot mutate the settled report", () => {
    const window = disagreementWindowAt(rows, 0, 2);
    expect(window.rows[0]).not.toBe(rows[0]);
    expect(window.rows[0]).toEqual(rows[0]);
  });
});

describe("selectDiagnosisDisagreements — the round-robin ranking (M5)", () => {
  /** Cells: (pos,neg)×5, (neg,pos)×2, (bad,ok)×1 — one per cell per pass. */
  const rows = buildDisagreementRows([
    ...Array.from({ length: 5 }, (_, i) => row(`a-${i}`, "pos", "neg", i + 1)),
    ...Array.from({ length: 2 }, (_, i) => row(`b-${i}`, "neg", "pos", i + 6)),
    row("c-0", "bad", "ok", 8),
  ]);
  const judge = rows.map((r) => r.judgeLabel);
  const human = rows.map((r) => r.humanLabel);
  const confusion = confusionMatrix(judge, human);

  it("ranks by confusion-cell frequency, round-robin across distinct cells", () => {
    const selected = selectDiagnosisDisagreements(rows, confusion, 6);
    expect(selected.map((r) => r.exampleId)).toEqual([
      "a-0",
      "b-0",
      "c-0",
      "a-1",
      "b-1",
      "a-2",
    ]);
  });

  it("never selects an agreeing row, even one that sorts first", () => {
    const withAgreement = buildDisagreementRows([
      row("z-0", "pos", "pos", 1),
      row("z-1", "pos", "neg", 2),
    ]);
    const selected = selectDiagnosisDisagreements(
      withAgreement,
      confusionMatrix(["neg", "pos"], ["pos", "neg"])
    );
    expect(selected.map((r) => r.exampleId)).toEqual(["z-1"]);
  });

  it("caps at DIAGNOSIS_DISAGREEMENT_LIMIT and declares the rule", () => {
    const many = buildDisagreementRows(
      Array.from({ length: 40 }, (_, i) => row(`d-${i}`, "pos", "neg", i + 1))
    );
    const selectedMany = selectDiagnosisDisagreements(
      many,
      confusionMatrix(["neg", "pos"], ["pos", "neg"])
    );
    expect(selectedMany).toHaveLength(DIAGNOSIS_DISAGREEMENT_LIMIT);
    expect(selectedMany.every((entry) => !entry.agree)).toBe(true);
    expect(DIAGNOSIS_SELECTION_COPY).toContain("round-robin across distinct cells");
  });
});
