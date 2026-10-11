import { describe, expect, it } from "vitest";
import { bootstrapTierCopy } from "../bootstrapCI";
import {
  percent,
  renderAgreementJsonl,
  renderMarkdownReport,
  renderOneLineVerdict,
  renderReceipt,
  sigFigs,
} from "../reportRender";
import { analyzeVerdicts } from "../analyze";
import { computeReport } from "../report";
import {
  ALPHA_KAPPA_BANDS_NOTE,
  ALPHA_VS_KAPPA_DISCLOSURE,
} from "../krippendorffAlpha";
import { GRADE_CONVENTION_COPY } from "../grade";
import { MAX_TABLE_ROWS } from "../constants";
import { reportDisagreementWindow } from "../report";
import type { RawVerdict } from "../types";

function headlineRows(): RawVerdict[] {
  const rows: RawVerdict[] = [];
  const push = (human: string, judge: string) =>
    rows.push({
      exampleId: `ex-${String(rows.length + 1).padStart(4, "0")}`,
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
      lineNumber: rows.length + 1,
    });
  for (let i = 0; i < 920; i++) push("pos", "pos");
  for (let i = 0; i < 30; i++) push("neg", "pos");
  for (let i = 0; i < 20; i++) push("pos", "neg");
  for (let i = 0; i < 30; i++) push("neg", "neg");
  return rows;
}

const report = computeReport(headlineRows(), {
  seed: 42,
  confidenceLevel: 0.95,
  deadlineMs: 1_000,
  engine: "worker",
});

describe("sigFigs / percent", () => {
  it("prints 17 significant digits for non-integers", () => {
    expect(sigFigs(0.51923076923076927)).toBe("0.51923076923076927");
  });

  it("prints integers without a decimal tail", () => {
    expect(sigFigs(950)).toBe("950");
    expect(sigFigs(0)).toBe("0");
  });

  it("prints percentages at one decimal", () => {
    expect(percent(0.95)).toBe("95.0%");
    expect(percent(0.94)).toBe("94.0%");
    expect(percent(1)).toBe("100.0%");
  });
});

describe("renderOneLineVerdict", () => {
  it("carries n, accuracy, the 17-sig-fig κ and the always-majority baseline", () => {
    const line = renderOneLineVerdict(report);
    expect(line).toContain("1,000 rows");
    expect(line).toContain("acc 95.0%");
    expect(line).toContain("κ 0.51923076923076927");
    expect(line).toContain("always-majority 94.0%");
  });

  it("carries the κ CI bracket and the letter grade (AC-55 shape)", () => {
    const line = renderOneLineVerdict(report);
    expect(line).toContain("grade C");
    expect(line).toMatch(/κ 0\.51923076923076927 \[0\.\d+, 0\.\d+\]/);
    // The CI that rides on the accuracy figure is the same seeded interval.
    expect(line).toMatch(/acc 95\.0% \[\d+\.\d%–\d+\.\d%\]/);
  });

  it("prints the systematic-disagreement copy for a negative κ (AC-57)", () => {
    const line = renderOneLineVerdict({ ...report, kappa: -0.2 });
    expect(line).toContain("κ -0.20000000000000001");
    expect(line).toContain("κ is negative — the judge disagrees systematically");
    expect(line).not.toContain("Δ");
  });

  it("says κ is undefined instead of printing a fabricated number", () => {
    const degenerate = computeReport(
      [
        {
          exampleId: "a",
          judgeLabel: "pass",
          humanLabels: ["pass"],
          judgeScore: null,
          humanScore: null,
          judgeCritique: null,
          humanCritique: null,
          judgeInput: null,
          judgeOutput: null,
          position: null,
          preferredLonger: null,
          lineNumber: 1,
        },
      ],
      { seed: 42, confidenceLevel: 0.95, deadlineMs: 1_000, engine: "worker" }
    );
    const line = renderOneLineVerdict(degenerate);
    expect(line).toContain("κ undefined");
    expect(line).not.toContain("κ 0");
  });
});

describe("renderMarkdownReport — the copy payload", () => {
  const markdown = renderMarkdownReport(report);

  it("carries the headline figures", () => {
    expect(markdown).toContain("RAW AGREEMENT (accuracy): 95.0%");
    expect(markdown).toContain("UNWEIGHTED κ (chance-corrected): 0.51923076923076927");
    expect(markdown).toContain("Δκ deflation: 0.43076923076923068");
    expect(markdown).toContain(
      "CHANCE BASELINE (always-majority on this label distribution): 94.0%"
    );
  });

  it("prints the confusion matrix as a markdown table", () => {
    expect(markdown).toContain("| human \\ judge | neg | pos | total |");
    expect(markdown).toContain("| neg | 30 | 30 | 60 |");
    expect(markdown).toContain("| pos | 20 | 920 | 940 |");
  });

  it("prints the binary metrics with the positive class named", () => {
    expect(markdown).toContain('positive class "pos"');
    expect(markdown).toContain("TP 920");
  });

  it("carries the receipt and the no-transcendentals note", () => {
    expect(markdown).toContain("REPRODUCIBILITY RECEIPT");
    expect(markdown).toContain("no transcendentals");
  });

  it("carries the seeded CIs, the grade, the α panel and the tier copy", () => {
    // D2: every deferred seam is now rendered, and each one is live data.
    expect(markdown).toContain("LETTER GRADE: C — moderate (");
    expect(markdown).toContain(GRADE_CONVENTION_COPY);
    expect(markdown).toContain("UNWEIGHTED κ (chance-corrected): 0.51923076923076927 [");
    expect(markdown).toContain("RAW AGREEMENT (accuracy): 95.0% [");
    expect(markdown).toMatch(/Δκ deflation: 0\.43076923076923068/);
    // The α panel, its disclosure and the human-ceiling honesty.
    expect(markdown).toContain("Krippendorff's α (nominal) — panel [judge, human1, …]:");
    expect(markdown).toContain(ALPHA_VS_KAPPA_DISCLOSURE);
    expect(markdown).toMatch(/human ceiling: undefined \(needs ≥2 human raters\)/);
    // The weighted secondary rows are labelled as secondary.
    expect(markdown).toContain("Weighted κ (secondary rows, 1 − D_o/D_e over sorted label ranks):");
    expect(markdown).toContain("these are secondary rows only");
    // The windowed disagreement strip names the truth.
    expect(markdown).toContain("Disagreements: 50 of 1,000 rows disagree");
    // The tier copy lands with its live numbers.
    expect(markdown).toContain(bootstrapTierCopy(1_000));
    expect(markdown).toContain("seed 42 · B 2,000");
    expect(markdown).toContain("κ-bands applied to α for comparability — not α's own convention".replace("κ-bands", "κ-bands") === ALPHA_KAPPA_BANDS_NOTE ? ALPHA_KAPPA_BANDS_NOTE : "");
  });

  it("does not claim the α letter is α's own convention", () => {
    expect(markdown).toContain(ALPHA_KAPPA_BANDS_NOTE);
  });
});

/**
 * A3 — window honesty. The settled report's `disagreements` is the
 * MAX_TABLE_ROWS display window (identical on both engines), so the card
 * prints the TRUE totals and names the window's scope instead of passing a
 * window count off as the total.
 */
describe("renderMarkdownReport — windowed scope is labelled, totals are true (A3)", () => {
  const full = computeReport(headlineRows(), {
    seed: 42,
    confidenceLevel: 0.95,
    deadlineMs: 1_000,
    engine: "worker",
  });
  const windowed = reportDisagreementWindow(full, 0, MAX_TABLE_ROWS);

  it("names the TRUE disagreement total beside the window scope", () => {
    const markdown = renderMarkdownReport(windowed);
    expect(markdown).toContain("Disagreements: 50 of 1,000 rows disagree");
    // The window is the whole 1,000-row set here, so no truncated-scope note.
    expect(markdown).not.toContain("(showing 1,000 of 1,000 rows in this card");
  });

  it("prints the full-set agreement total independently of the window", () => {
    const markdown = renderMarkdownReport(windowed);
    expect(markdown).toContain(
      "Agreements: 950 of 1,000 rows — the full-set totals above are independent of the display window"
    );
  });

  it("a report whose window is smaller than the whole set discloses the cap", () => {
    const sliced = reportDisagreementWindow(full, 0, 2);
    const markdown = renderMarkdownReport(sliced);
    // The TRUE total still reads 50 — never the 2 rows inside the window.
    expect(markdown).toContain("Disagreements: 50 of 1,000 rows disagree");
    expect(markdown).toContain(
      "(showing 2 of 1,000 rows in this card; the row window caps at 2,000)"
    );
  });

  it("renderAgreementJsonl ships exactly the settled window — never a fabricated full set", () => {
    const sliced = reportDisagreementWindow(full, 0, 2);
    const lines = renderAgreementJsonl(sliced).split("\n");
    // The export carries the window, not the 1,000 analyzed rows.
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      '{"example_id":"ex-0001","judge_label":"pos","human_label":"pos","agree":true}'
    );
    // The head row of the full-set export is the same row: the window is the
    // head of the full set, so both engines' exports start identically.
    expect(renderAgreementJsonl(full).split("\n")[0]).toBe(lines[0]);
    expect(renderAgreementJsonl(full).split("\n")).toHaveLength(1_000);
  });
});

describe("renderReceipt — a reviewer can recompute κ from it alone", () => {
  const inputs = { n: 1000, a: 950, s: 896000, numerator: 54000, denominator: 104000 };
  const receipt = renderReceipt(report, inputs, {
    seed: 42,
    confidenceLevel: 0.95,
    deadlineMs: 1_000,
    deadlineHit: false,
  });

  it("prints the formula, n, A, S and the two products", () => {
    expect(receipt).toContain("κ = (A·n − S) / (n² − S)");
    expect(receipt).toContain("n = 1000");
    expect(receipt).toContain("A = 950");
    expect(receipt).toContain("S = 896000");
    expect(receipt).toContain("A·n − S = 54000");
    expect(receipt).toContain("n² − S = 104000");
  });

  it("prints the matrix a reviewer needs for the arithmetic", () => {
    expect(receipt).toContain("neg\t30\t30\t60");
    expect(receipt).toContain("pos\t20\t920\t940");
    expect(receipt).toContain("colTotals\t50\t950"); // judge marginals
  });

  it("carries the settings block and the engine", () => {
    expect(receipt).toContain("engine: worker");
    expect(receipt).toContain("seed 42");
    expect(receipt).toContain("confidence 0.95");
    expect(receipt).toContain("deadline 1000ms");
  });

  it("names the analytic baseline identity", () => {
    expect(receipt).toContain("p_o = p_e identity");
  });

  it("carries the seeded bootstrap block with seed, B, ciDropped, reason and engine", () => {
    expect(receipt).toContain("bootstrap: seed 42 · B 2,000");
    expect(receipt).toContain(bootstrapTierCopy(1_000));
    expect(receipt).toMatch(/ci: accuracy 0\.9\d+ – 0\.96\d+ \(point 0\.94\d+, 2,000 replicates\)/);
    expect(receipt).toContain("engine: worker · ciDropped: false · reason: none");
  });

  it("carries the α panel inputs and the κ-vs-α disclosure", () => {
    expect(receipt).toContain("Krippendorff's α (nominal) over [judge, human1, …]:");
    expect(receipt).toContain(ALPHA_VS_KAPPA_DISCLOSURE);
    expect(receipt).toContain("grade: C (moderate) — Landis–Koch bands applied to unweighted κ");
  });

  it("names the deadline honestly when it tripped (AC-32)", () => {
    const dropped = { ...report, ciDropped: true, ci: { accuracy: null, kappa: null, alpha: null } };
    const text = renderReceipt(dropped, inputs, {
      seed: 42,
      confidenceLevel: 0.95,
      deadlineMs: 1_000,
      deadlineHit: true,
    });
    expect(text).toContain("ciDropped: true");
    expect(text).toContain("the cooperative deadline was reached before the replicates completed");
    expect(text).toContain("point statistics are unchanged");
  });

  it("prints the undefined-κ receipt when the guard fired", () => {
    const receipt = renderReceipt(
      { ...report, kappa: null },
      null,
      { seed: 42, confidenceLevel: 0.95, deadlineMs: 1000, deadlineHit: false }
    );
    expect(receipt).toContain("κ: undefined");
  });
});

/**
 * AC-55 / m3: the one-line verdict is a golden string at 17 significant digits
 * — the exact copy ⌘⇧C ships on the headline fixture.
 */
describe("AC-55 — the golden one-line verdict", () => {
  it("is byte-exact on the headline fixture", () => {
    expect(renderOneLineVerdict(report)).toBe(
      "Human agreement: 1,000 rows · acc 95.0% [93.6%–96.4%] · κ 0.51923076923076927 [0.39718157858473974, 0.62811512020133808] · grade C · always-majority 94.0%"
    );
  });
});

/**
 * AC-28: JSONL and CSV settle the SAME report, so the markdown card and the
 * agreement JSONL export are byte-identical across the two input formats.
 */
describe("AC-28 — the exports are format-invariant", () => {
  const JSONL = [
    '{"example_id":"e1","judge_label":"pos","human_label":"pos"}',
    '{"example_id":"e2","judge_label":"neg","human_label":"pos"}',
    '{"example_id":"e3","judge_label":"neg","human_label":"neg"}',
    '{"example_id":"e4","judge_label":"pos","human_label":"neg"}',
  ].join("\n");
  const CSV = [
    "example_id,judge_label,human_label",
    "e1,pos,pos",
    "e2,neg,pos",
    "e3,neg,neg",
    "e4,pos,neg",
  ].join("\n");

  it("markdown card and agreement JSONL are identical for JSONL and CSV", () => {
    const a = analyzeVerdicts(JSONL);
    const b = analyzeVerdicts(CSV);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(renderMarkdownReport(a.stats.report)).toBe(
      renderMarkdownReport(b.stats.report)
    );
    expect(renderAgreementJsonl(a.stats.report)).toBe(
      renderAgreementJsonl(b.stats.report)
    );
    expect(renderAgreementJsonl(a.stats.report).split("\n")).toEqual([
      '{"example_id":"e1","judge_label":"pos","human_label":"pos","agree":true}',
      '{"example_id":"e2","judge_label":"neg","human_label":"pos","agree":false}',
      '{"example_id":"e3","judge_label":"neg","human_label":"neg","agree":true}',
      '{"example_id":"e4","judge_label":"pos","human_label":"neg","agree":false}',
    ]);
  });
});
