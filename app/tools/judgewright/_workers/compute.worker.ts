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
 *
 * A13 — a key match is no longer sufficient to serve: the cached entry's
 * FINGERPRINT (length, a position-weighted checksum, head + tail 64 chars, the
 * rubric length and the settings) must equal the dispatching input's, so a
 * 32-bit hash collision recomputes instead of returning the wrong report.
 */

/**
 * A13 — what one LRU slot holds: the cached report AND the fingerprint of the
 * exact input that produced it. The 32-bit FNV key is only 32 bits, so two
 * different pastes CAN collide (a birthday collision is expected after a few
 * tens of thousands of distinct dispatches); serving the loser's report for
 * the winner's paste would be a silently WRONG report, which is the one
 * failure this tool cannot afford. The fingerprint is a cheap content check —
 * total length, head/tail 64 characters, the rubric length and the settings
 * that the key already mixed in — so a collision is caught instead of served.
 */
interface CacheEntry {
  stats: VerdictAnalysis;
  fingerprint: string;
}

const artifactCache = new Map<string, CacheEntry>();

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

/** A13: how much of each end of the paste the fingerprint names verbatim. */
const FINGERPRINT_CHARS = 64;

/**
 * FNV-1a over the actual payload (content, not lengths — two different pastes
 * of equal size must never share a cached report). Chunked over the text so a
 * 40 MB paste stays well inside the watchdog budget.
 *
 * A13 — returns the 32-bit key AND a content fingerprint in one pass. The
 * key is the cache address; the fingerprint is the identity check a hit must
 * survive before its report may be served.
 */
function hashInput(input: WorkerInputPayload): {
  key: string;
  fingerprint: string;
} {
  let hash = 0x811c9dc5;
  // A position-weighted additive checksum: INDEPENDENT of the FNV
  // construction above, so a single edit anywhere in the middle of a paste
  // (same length, same head, same tail) still changes it. One fused pass
  // keeps the cost of the extra check negligible next to the FNV loop.
  let checksum = 0;
  const mix = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
      checksum = (checksum + text.charCodeAt(i) * (i + 1)) | 0;
    }
  };
  mix(input.verdictsText);
  mix(`\u0000${input.rubric}`);
  mix(
    `\u0000${input.settings.seed}:${input.settings.confidenceLevel}:${input.settings.judgeScoreMode}:${input.settings.positiveClass ?? ""}:${(input.settings.labelOrder ?? []).join(",")}`
  );
  const text = input.verdictsText;
  const head = text.slice(0, FINGERPRINT_CHARS);
  const tail =
    text.length > FINGERPRINT_CHARS ? text.slice(-FINGERPRINT_CHARS) : "";
  return {
    key: (hash >>> 0).toString(36),
    fingerprint:
      `${text.length}|${checksum >>> 0}|${head}|${tail}|` +
      `${input.rubric.length}|${input.settings.seed}:${input.settings.confidenceLevel}:` +
      `${input.settings.judgeScoreMode}:${input.settings.positiveClass ?? ""}:` +
      `${(input.settings.labelOrder ?? []).join(",")}`,
  };
}

/**
 * A13 — the content fingerprint for one dispatch, exported for the unit suite
 * (which proves it is an identity check and not a second hash of the key).
 */
export function artifactCacheFingerprint(input: WorkerInputPayload): string {
  return hashInput(input).fingerprint;
}

/**
 * A13 — a cached entry may only be served when its fingerprint matches the
 * DISPATCH it is about to answer. A key match with a fingerprint mismatch is
 * a 32-bit hash collision: recompute instead of reporting the wrong verdicts.
 */
function isSameArtifact(fingerprint: string, entry: CacheEntry): boolean {
  return entry.fingerprint === fingerprint;
}

function getCachedArtifacts(
  key: string,
  fingerprint: string
): VerdictAnalysis | undefined {
  const hit = artifactCache.get(key);
  // A13: the fingerprint check. A collision is dropped (and evicted below by
  // the fresh write) rather than served — a wrong report is worse than a
  // recompute.
  if (hit === undefined || !isSameArtifact(fingerprint, hit)) return undefined;
  // Refresh recency (Map iterates in insertion order).
  artifactCache.delete(key);
  artifactCache.set(key, hit);
  return hit.stats;
}

function setCachedArtifacts(
  key: string,
  stats: VerdictAnalysis,
  fingerprint: string
): void {
  artifactCache.set(key, { stats, fingerprint });
  if (artifactCache.size > ARTIFACT_CACHE_CAPACITY) {
    const oldest = artifactCache.keys().next().value;
    if (oldest !== undefined) artifactCache.delete(oldest);
  }
}

self.onmessage = (event: MessageEvent<WorkerInputPayload>) => {
  // Stale guard FIRST: a late reply from a superseded dispatch is dropped
  // before it can touch the cache or post a result.
  const { id, verdictsText, settings } = event.data;
  const { key, fingerprint } = hashInput(event.data);

  try {
    const cached = getCachedArtifacts(key, fingerprint);
    const result = cached
      ? { ok: true as const, stats: cached }
      : analyzeVerdicts(verdictsText, {
          deadlineMs: WORKER_DEADLINE_MS,
          engine: "worker",
          seed: settings.seed,
          confidenceLevel: settings.confidenceLevel,
          judgeScoreMode: settings.judgeScoreMode,
          positiveClass: settings.positiveClass,
          labelOrder: settings.labelOrder,
        });

    if (result.ok) {
      // AC-16/AC-59: the payload carries the summary plus the first
      // MAX_TABLE_ROWS per-example rows, and the true totalCount names what it
      // does not show. The cache stores the same windowed form, so a cache hit
      // never grows the transferred payload.
      const windowed = windowedStats(result.stats);
      if (!cached) setCachedArtifacts(key, windowed, fingerprint);
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
