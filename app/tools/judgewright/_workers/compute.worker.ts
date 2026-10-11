/// <reference lib="webworker" />

import { analyzeVerdicts, reportDisagreementWindow } from "../_lib/analyze";
import {
  ARTIFACT_CACHE_CAPACITY,
  MAX_TABLE_ROWS,
  WORKER_DEADLINE_MS,
} from "../_lib/constants";
import type {
  VerdictAnalysis,
  WorkerInputPayload,
  WorkerOutputPayload,
} from "../_lib/types";

/**
 * Off-main-thread execution for Judgewright.
 *
 * The worker imports ONLY `_lib` (BAR §4.7) and calls `analyzeVerdicts` — the
 * exact same pure core the synchronous fallback runs, so the two paths cannot
 * drift. The D1 core settles the point statistics (confusion, unweighted κ,
 * chance baseline, receipt); the envelope below carries that summary plus the
 * parse issues and the D3 disagreement-window seam (windowed rows arrive with
 * the disagreement-table milestone; `totalCount` is already honest).
 *
 * The LRU below is the artifact seam: entries are keyed by a CONTENT hash,
 * refreshed on hit, capped at ARTIFACT_CACHE_CAPACITY, and only error-free
 * results are cached — with the disagreement DISPLAY WINDOW, never the full
 * row set, so a 200k-row dispatch caches (and posts) a summary.
 */

const artifactCache = new Map<string, VerdictAnalysis>();

/**
 * The payload form of a settled analysis: the full report with its
 * disagreement rows replaced by the first `MAX_TABLE_ROWS` (the display
 * window). `report.n`, the receipt and every point statistic are untouched —
 * only the per-example table is windowed, and the true total rides alongside.
 */
function windowedStats(stats: VerdictAnalysis): VerdictAnalysis {
  return {
    ...stats,
    report: reportDisagreementWindow(stats.report, 0, MAX_TABLE_ROWS),
  };
}

/**
 * FNV-1a over the actual payload (content, not lengths — two different pastes
 * of equal size must never share a cached report). Chunked over the text so a
 * 40 MB paste stays well inside the watchdog budget.
 */
function hashInput(input: WorkerInputPayload): string {
  let hash = 0x811c9dc5;
  const mix = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  mix(input.verdictsText);
  mix(`\u0000${input.rubric}`);
  mix(
    `\u0000${input.settings.seed}:${input.settings.confidenceLevel}`
  );
  return (hash >>> 0).toString(36);
}

function getCachedArtifacts(key: string): VerdictAnalysis | undefined {
  const hit = artifactCache.get(key);
  if (hit !== undefined) {
    // Refresh recency (Map iterates in insertion order).
    artifactCache.delete(key);
    artifactCache.set(key, hit);
  }
  return hit;
}

function setCachedArtifacts(key: string, stats: VerdictAnalysis): void {
  artifactCache.set(key, stats);
  if (artifactCache.size > ARTIFACT_CACHE_CAPACITY) {
    const oldest = artifactCache.keys().next().value;
    if (oldest !== undefined) artifactCache.delete(oldest);
  }
}

self.onmessage = (event: MessageEvent<WorkerInputPayload>) => {
  // Stale guard FIRST: a late reply from a superseded dispatch is dropped
  // before it can touch the cache or post a result.
  const { id, verdictsText, settings } = event.data;
  const key = hashInput(event.data);

  try {
    const cached = getCachedArtifacts(key);
    const result = cached
      ? { ok: true as const, stats: cached }
      : analyzeVerdicts(verdictsText, {
          deadlineMs: WORKER_DEADLINE_MS,
          engine: "worker",
          seed: settings.seed,
          confidenceLevel: settings.confidenceLevel,
        });

    if (result.ok) {
      // AC-16/AC-59: the payload carries the summary plus the first
      // MAX_TABLE_ROWS per-example rows, and the true totalCount names what it
      // does not show. The cache stores the same windowed form, so a cache hit
      // never grows the transferred payload.
      const windowed = windowedStats(result.stats);
      if (!cached) setCachedArtifacts(key, windowed);
      self.postMessage({
        id,
        ok: true,
        error: null,
        degraded: false,
        stats: windowed,
        issues: windowed.parse.issues,
        issueCount: windowed.parse.issueCount,
        disagreementWindow: {
          offset: 0,
          rows: windowed.report.disagreements,
          totalCount: result.stats.report.n,
        },
      } satisfies WorkerOutputPayload);
      return;
    }

    self.postMessage({
      id,
      ok: false,
      error: result.error,
      degraded: false,
      stats: null,
      issues: result.issues,
      issueCount: result.issueCount,
      disagreementWindow: { offset: 0, rows: [], totalCount: 0 },
    } satisfies WorkerOutputPayload);
  } catch (err) {
    // Last-resort envelope (BAR §4.4): a friendly value, never a raw stack.
    self.postMessage({
      id,
      ok: false,
      error:
        err instanceof Error ? err.message : "Unexpected error inside worker",
      degraded: false,
      stats: null,
      issues: [],
      issueCount: 0,
      disagreementWindow: { offset: 0, rows: [], totalCount: 0 },
    } satisfies WorkerOutputPayload);
  }
};
