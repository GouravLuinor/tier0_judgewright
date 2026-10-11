/**
 * Judgewright — the analysis seam (SPEC §4 / BAR §4.2).
 *
 * `analyzeVerdicts` is the ONE function the Web Worker and the synchronous
 * main-thread fallback both call, so the two paths cannot drift. It owns the
 * pipeline: capacity check → `parseVerdicts` → hard-error envelopes →
 * `computeReport`. The statistics themselves live in `_lib/report.ts` and its
 * siblings; this module is orchestration only, and it stays pure (no React, no
 * DOM, no IO) so the worker, the hook, the store and the UI keep working
 * untouched when the core grows (BAR §4.4).
 *
 * Errors are VALUES (`ok: false`), never throws. All-rows-invalid settles the
 * FM-17 envelope with `report === null` — never a zero-filled report — and the
 * hard parse errors (mixed vocabularies, capacity, ambiguity) settle their own
 * verbatim copy with the first issues attached.
 */

import {
  DEFAULT_CONFIDENCE_LEVEL,
  DEFAULT_SEED,
  MAX_INPUT_CHARS,
  MAX_PARSE_ISSUES,
  WORKER_DEADLINE_MS,
} from "./constants.ts";
import { parseVerdicts } from "./parse.ts";
import { computeReport, reportDisagreementWindow } from "./report.ts";
import type {
  AlphaLevel,
  AnalysisOutcome,
  BinMode,
  CalibrationReport,
  ComputeEngine,
  JudgeScoreMode,
  ParseIssue,
  VerdictAnalysis,
} from "./types";

export interface AnalyzeOptions {
  /** Cooperative budget: worker 1,000 ms · sync fallback 800 ms. */
  deadlineMs?: number;
  /**
   * A2 — the cooperative budget as an ABSOLUTE timestamp (`Date.now()`). When
   * supplied it REPLACES the internally derived boundary, so the budget can be
   * forced (tests) or folded to cover the parse; without it the budget starts
   * just before the parse.
   */
  deadlineAt?: number;
  /** Bootstrap seed — echoed in the receipt; deterministic once M2 lands. */
  seed?: number;
  /** Confidence level the CI panel will report (echoed in the receipt). */
  confidenceLevel?: number;
  /** Paste ceiling override for tests. */
  maxInputChars?: number;
  /**
   * A10 — when TRUE the parse loop itself carries the cooperative budget
   * (`deadlineAt`), so a pathological paste settles a `capacity` parse error
   * instead of holding the calling thread. ARMED ONLY FOR THE MAIN-THREAD
   * FALLBACK: the worker parses on its own thread, where a long parse costs
   * the UI nothing and its watchdog (tiered by payload size, `watchdogMsFor`)
   * is the real guard — arming it there would turn a legitimate 200k-row
   * dispatch into a spurious error, which A2's "an in-cap input always
   * settles a report" contract forbids.
   */
  parseDeadlineArmed?: boolean;
  /** Which engine is running — stamped into the result, never guessed. */
  engine?: ComputeEngine;
  /** Krippendorff's α level (default nominal; the selector UI lands in D3). */
  alphaLevel?: AlphaLevel;
  /** Explicit rank order for ordinal α on non-numeric labels. */
  labelOrder?: string[];
  /** Score semantics for ECE/Brier (AC-40; default `p-positive`). */
  judgeScoreMode?: JudgeScoreMode;
  /** User-overridable positive class (default = second sorted label). */
  positiveClass?: string;
  /** ECE bin count (default 10). */
  bins?: number;
  /** ECE binning scheme (default `width`). */
  binMode?: BinMode;
}

/** UTF-8 byte length — the honest unit for a paste budget. */
export function countBytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Whitespace-delimited words; an all-whitespace paste counts zero words. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** `\n`-delimited lines, with a trailing line counted exactly once. */
export function countLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
}

/** First `MAX_PARSE_ISSUES` issues, for the display list. */
function leadingIssues(issues: readonly ParseIssue[]): ParseIssue[] {
  return issues.slice(0, MAX_PARSE_ISSUES);
}

export { reportDisagreementWindow };

/**
 * Analyzes a pasted verdict set and settles either the D2 calibration report
 * (α, weighted κ, seeded CIs, letter grade, deflation and the per-example
 * disagreement rows) or a friendly error value.
 */
export function analyzeVerdicts(
  verdictsText: string,
  options: AnalyzeOptions = {}
): AnalysisOutcome {
  const deadlineMs = options.deadlineMs ?? WORKER_DEADLINE_MS;
  const engine: ComputeEngine = options.engine ?? "worker";
  const maxInputChars = options.maxInputChars ?? MAX_INPUT_CHARS;
  const seed = options.seed ?? DEFAULT_SEED;
  const confidenceLevel = options.confidenceLevel ?? DEFAULT_CONFIDENCE_LEVEL;
  const startedAt = Date.now();

  if (verdictsText.length > maxInputChars) {
    // Capacity class (SPEC §2.1.8): honest about the true size, nothing parsed.
    return {
      ok: false,
      error: `Input is ${verdictsText.length.toLocaleString("en-US")} characters — the limit is ${maxInputChars.toLocaleString("en-US")}.`,
      issues: [],
      issueCount: 0,
    };
  }

  if (verdictsText.trim().length === 0) {
    return {
      ok: false,
      error: "Nothing to analyze yet — paste verdicts as JSONL or CSV.",
      issues: [],
      issueCount: 0,
    };
  }

  // A10: derive the ABSOLUTE budget once, BEFORE the parse, and hand the parse
  // the same boundary on the main-thread fallback path (where an unbounded
  // parse is a main-thread freeze). The worker path deliberately parses
  // unbudgeted: it runs off-main-thread under a tiered watchdog.
  const deadlineAt = options.deadlineAt ?? startedAt + deadlineMs;
  const parsed = parseVerdicts(
    verdictsText,
    options.parseDeadlineArmed === true ? { deadlineAt, budgetMs: deadlineMs } : {}
  );

  // A fatal parse (mixed vocabularies, capacity, single-column input,
  // ambiguity on an id/label slot) settles its OWN verbatim copy: no partial
  // report is ever built from it (SPEC §2.1.8 "hard" column).
  if (parsed.fatal && parsed.verdicts.length === 0) {
    return {
      ok: false,
      error: parsed.issues[0]?.reason ?? "The input could not be parsed.",
      issues: leadingIssues(parsed.issues),
      issueCount: parsed.issueCount,
    };
  }

  if (parsed.verdicts.length === 0) {
    // FM-17: every row failed validation — report === null, never zero-filled.
    return {
      ok: false,
      error:
        "No usable rows — every row failed validation. Fix the first issue and try again.",
      issues: leadingIssues(parsed.issues),
      issueCount: parsed.issueCount,
    };
  }

  try {
    // A2: the cooperative budget is an ABSOLUTE timestamp taken BEFORE the
    // parse, so the parse is folded into the budget instead of eating into
    // the compute phases unchecked. A trip therefore reports honestly
    // (`ciDropped`) while the point statistics still settle — an in-cap
    // input never produces an error-with-no-report.
    const report: CalibrationReport = computeReport(parsed.verdicts, {
      seed,
      confidenceLevel,
      deadlineMs,
      deadlineAt,
      engine,
      truncated: parsed.capped,
      rowCount: parsed.rowCount,
      // A12: the duplicated `judge_score` slot makes the calibration panel
      // honestly not computable instead of confident and wrong.
      judgeScoreAmbiguous: parsed.judgeScoreAmbiguous,
      alphaLevel: options.alphaLevel,
      labelOrder: options.labelOrder,
      judgeScoreMode: options.judgeScoreMode,
      positiveClass: options.positiveClass,
      bins: options.bins,
      binMode: options.binMode,
    });

    const stats: VerdictAnalysis = {
      report,
      parse: {
        format: parsed.format,
        rowCount: parsed.rowCount,
        capped: parsed.capped,
        issues: leadingIssues(parsed.issues),
        issueCount: parsed.issueCount,
        warnings: parsed.warnings,
      },
      characterCount: verdictsText.length,
      wordCount: countWords(verdictsText),
      byteCount: countBytes(verdictsText),
      lineCount: countLines(verdictsText),
      executionTimeMs: Math.max(0, Date.now() - startedAt),
      engine,
    };

    return { ok: true, stats };
  } catch {
    // Last-resort envelope (BAR §4.4): a friendly value, never a raw stack.
    return {
      ok: false,
      error:
        "The report could not be computed from this input. Check the first issue below and try again.",
      issues: leadingIssues(parsed.issues),
      issueCount: parsed.issueCount,
    };
  }
}
