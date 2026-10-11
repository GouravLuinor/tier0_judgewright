/**
 * Judgewright — placeholder compute core (the pure seam for statistics).
 *
 * This is the scaffold's single source of semantics: the Web Worker and the
 * synchronous main-thread fallback BOTH call `analyzeVerdicts`, so the two
 * paths cannot drift (BAR §4.2). Today it computes a deliberately trivial
 * placeholder measurement — character / word / byte / line counts plus an
 * echo of the analyzed text — which is enough to prove the whole pipeline
 * (paste → worker → render → copy) end to end.
 *
 * The statistics milestone (PLAN M1/M2) replaces the body with
 * `parseVerdicts()` → `confusionMatrix()` → `cohensKappa()` → … →
 * `computeReport()` and keeps this exact signature, so the worker, the hook,
 * the store and the UI keep working untouched. Errors stay VALUES, never
 * throws (BAR §4.4).
 */

import {
  ECHO_LIMIT_CHARS,
  MAX_INPUT_CHARS,
  WORKER_DEADLINE_MS,
} from "./constants";
import type { AnalysisOutcome, ComputeEngine } from "./types";

export interface AnalyzeOptions {
  /** Cooperative budget: worker 1,000 ms · sync fallback 800 ms. */
  deadlineMs?: number;
  /** Paste ceiling override for tests. */
  maxInputChars?: number;
  /** How much of the paste the echo panel mirrors back. */
  echoLimitChars?: number;
  /** Which engine is running — stamped into the result, never guessed. */
  engine?: ComputeEngine;
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

/**
 * Trivial-but-real placeholder analysis of a pasted verdict set.
 *
 * @returns either the placeholder stats (`ok: true`) or a friendly,
 *          user-facing error value (`ok: false`) — never a throw.
 */
export function analyzeVerdicts(
  verdictsText: string,
  options: AnalyzeOptions = {}
): AnalysisOutcome {
  const deadlineMs = options.deadlineMs ?? WORKER_DEADLINE_MS;
  const maxInputChars = options.maxInputChars ?? MAX_INPUT_CHARS;
  const echoLimitChars = options.echoLimitChars ?? ECHO_LIMIT_CHARS;
  const engine: ComputeEngine = options.engine ?? "worker";
  const startedAt = Date.now();

  if (verdictsText.length > maxInputChars) {
    // Capacity class (SPEC §2.1.8): honest about the true size, nothing parsed.
    return {
      ok: false,
      error: `Input is ${verdictsText.length.toLocaleString("en-US")} characters — the limit is ${maxInputChars.toLocaleString("en-US")}.`,
    };
  }

  // Cooperative deadline: the placeholder compute is far cheaper than the
  // budget, but the seam stays so the statistics milestone inherits it.
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs > deadlineMs) {
    return {
      ok: false,
      error: `Analysis exceeded the ${deadlineMs} ms budget — point statistics are unaffected.`,
    };
  }

  const echo = verdictsText.slice(0, echoLimitChars);

  return {
    ok: true,
    stats: {
      characterCount: verdictsText.length,
      wordCount: countWords(verdictsText),
      byteCount: countBytes(verdictsText),
      lineCount: countLines(verdictsText),
      echo,
      echoTruncated: verdictsText.length > echoLimitChars,
      executionTimeMs: Math.max(0, Date.now() - startedAt),
      engine,
    },
  };
}
