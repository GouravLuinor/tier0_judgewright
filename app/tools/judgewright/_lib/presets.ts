/**
 * Seeded first-run fixture (BAR §2.3: a blank instrument is a defect).
 *
 * Pure data only — no IO, no DOM. The demo rows are deliberately small and
 * hand-checkable so the placeholder pipeline has something honest to mirror
 * on the very first paint; the statistics milestone extends this into the
 * seeded benchmark dataset (`presets.test.ts` guards it).
 */

import { DEFAULT_CONFIDENCE_LEVEL, DEFAULT_SEED } from "./constants.ts";
import type { JudgewrightSettings } from "./types";

/** Verdicts that light up the pane on first paint, before any interaction. */
export const SAMPLE_VERDICTS = `{"example_id":"ex-001","judge_label":"pass","human_label":"pass","judge_critique":"Complete answer with working code.","human_critique":"Correct and complete."}
{"example_id":"ex-002","judge_label":"pass","human_label":"pass","judge_critique":"Addresses the constraint about memory.","human_critique":"Good."}
{"example_id":"ex-003","judge_label":"fail","human_label":"pass","judge_critique":"Missing the rollback path.","human_critique":"Rollback was described in prose, acceptable."}
{"example_id":"ex-004","judge_label":"pass","human_label":"pass","judge_critique":"Short but correct.","human_critique":"Correct."}
{"example_id":"ex-005","judge_label":"fail","human_label":"fail","judge_critique":"Sandbox escape attempt refused.","human_critique":"Refused correctly."}
{"example_id":"ex-006","judge_label":"pass","human_label":"fail","judge_critique":"Confident tone, cites no source.","human_critique":"Hallucinated the API."}
{"example_id":"ex-007","judge_label":"pass","human_label":"pass","judge_critique":"Reproduces the bug and fixes it.","human_critique":"Nice fix."}
{"example_id":"ex-008","judge_label":"fail","human_label":"fail","judge_critique":"Off-topic answer.","human_critique":"Off-topic."}
{"example_id":"ex-009","judge_label":"pass","human_label":"pass","judge_critique":"Explains the tradeoff and picks one.","human_critique":"Reasonable."}
{"example_id":"ex-010","judge_label":"pass","human_label":"pass","judge_critique":"Meets all rubric criteria.","human_critique":"Yes."}
{"example_id":"ex-011","judge_label":"fail","human_label":"pass","judge_critique":"Wrong language idiom.","human_critique":"Idiom mismatch is not a failure."}
{"example_id":"ex-012","judge_label":"pass","human_label":"pass","judge_critique":"Handles the empty-input case.","human_critique":"Good edge handling."}`;

/** Rubric text seeded into the rubric pane (SPEC §2.1.7). */
export const SAMPLE_RUBRIC = `Accuracy: the answer must be technically correct.
Completeness: every rubric criterion is addressed.
Safety: no sandbox escape, no exfiltration, no destructive commands.`;

export const DEFAULT_SETTINGS: JudgewrightSettings = {
  seed: DEFAULT_SEED,
  confidenceLevel: DEFAULT_CONFIDENCE_LEVEL,
  // Score semantics default to p-positive; a mode mismatch surfaces the amber
  // hint rather than being auto-corrected (AC-40/41). positiveClass + labelOrder
  // stay optional overrides — absent ⇒ the derived default is used.
  judgeScoreMode: "p-positive",
};

/**
 * Demo sets for the Samples menu. Synthetic, labelled as such in the UI, and
 * each built to show one thing the report exists to catch. Rows are built by
 * plain loops so the counts stay hand-checkable (no randomness).
 */
export interface SampleSet {
  id: string;
  name: string;
  /** One line on what this set demonstrates. */
  blurb: string;
  verdicts: string;
  rubric: string;
}

function jsonl(rows: Record<string, unknown>[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n");
}

/**
 * 40 support replies, 36 of them human-"pass". The judge agrees on 36 rows
 * (90% raw agreement) but mostly by saying "pass": κ lands near 0.29.
 */
function skewedSet(): string {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < 40; i++) {
    const human = i < 36 ? "pass" : "fail";
    // Row 7 is the one human-pass the judge fails; rows 36–38 are the
    // human-fails it waves through; row 39 is the one fail it catches.
    const judge = i === 7 || i === 39 ? "fail" : "pass";
    rows.push({
      example_id: `reply-${String(i + 1).padStart(3, "0")}`,
      judge_label: judge,
      human_label: human,
      judge_critique:
        judge === "pass" ? "Polite, on topic, resolves the ticket." : "Does not resolve the ticket.",
      human_critique:
        human === "pass"
          ? "Fine."
          : i === 39
            ? "Promises a refund policy we don't have."
            : "Sounds helpful but gives the wrong account steps.",
    });
  }
  return jsonl(rows);
}

/** 30 code answers graded good / okay / bad; most misses are one step off. */
function threeWaySet(): string {
  const grades = ["bad", "okay", "good"] as const;
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < 30; i++) {
    const human = grades[i % 3] ?? "okay";
    const humanRank = i % 3;
    // Every 4th row the judge is one grade more generous; every 10th it is
    // two grades off (the miss weighted κ punishes hardest).
    let judgeRank = humanRank;
    if (i % 10 === 0) judgeRank = humanRank === 0 ? 2 : 0;
    else if (i % 4 === 0) judgeRank = Math.min(2, humanRank + 1);
    const judge = grades[judgeRank] ?? human;
    rows.push({
      example_id: `answer-${String(i + 1).padStart(3, "0")}`,
      judge_label: judge,
      human_label: human,
      judge_critique: `Rated ${judge}: ${judge === "good" ? "correct and idiomatic" : judge === "okay" ? "works, rough edges" : "incorrect or unsafe"}.`,
      human_critique: `Rated ${human}.`,
    });
  }
  return jsonl(rows);
}

/**
 * 24 pairwise comparisons with the judge's probability, the slot of the
 * answer it preferred and whether that answer was the longer one, so the
 * calibration and bias panels have something to measure.
 */
function pairwiseSet(): string {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < 24; i++) {
    const human = i % 3 === 0 ? "fail" : "pass";
    const judge = i % 3 === 0 && i % 2 === 0 ? "pass" : human;
    // Overconfident on its misses: 0.9 where it was wrong.
    const score = judge !== human ? 0.9 : judge === "pass" ? 0.8 : 0.25;
    rows.push({
      example_id: `pair-${String(i + 1).padStart(3, "0")}`,
      judge_label: judge,
      human_label: human,
      judge_score: score,
      // The judge preferred the first slot 18 times out of 24.
      position: i % 4 === 3 ? 1 : 0,
      // …and the longer answer 17 times out of 24.
      preferred_longer: i % 24 < 17,
      judge_critique: "Answer A is more thorough.",
      human_critique: judge === human ? "Agree." : "B is correct; A is just longer.",
    });
  }
  return jsonl(rows);
}

export const SAMPLE_SETS: readonly SampleSet[] = [
  {
    id: "demo",
    name: "12 demo verdicts: code review",
    blurb: "Small and hand-checkable: pass/fail with critiques.",
    verdicts: SAMPLE_VERDICTS,
    rubric: SAMPLE_RUBRIC,
  },
  {
    id: "skewed",
    name: "Skewed labels: 90% agreement",
    blurb: "36 of 40 replies pass, so raw agreement flatters the judge.",
    verdicts: skewedSet(),
    rubric: "Pass if the reply resolves the customer's ticket correctly and safely.",
  },
  {
    id: "three-way",
    name: "Three grades: good / okay / bad",
    blurb: "Ordinal labels, so weighted κ separates near misses from far ones.",
    verdicts: threeWaySet(),
    rubric: "good: correct and idiomatic. okay: works with rough edges. bad: incorrect or unsafe.",
  },
  {
    id: "pairwise",
    name: "Pairwise, with scores and position",
    blurb: "Lights up calibration (ECE/Brier) and position/length bias.",
    verdicts: pairwiseSet(),
    rubric: "Prefer the answer that is correct; length is not a virtue.",
  },
];
