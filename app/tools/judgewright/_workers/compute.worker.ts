/// <reference lib="webworker" />

import { analyzeVerdicts } from "../_lib/analyze";
import {
  ARTIFACT_CACHE_CAPACITY,
  WORKER_DEADLINE_MS,
} from "../_lib/constants";
import type {
  PlaceholderStats,
  WorkerInputPayload,
  WorkerOutputPayload,
} from "../_lib/types";

/**
 * Off-main-thread execution for Judgewright.
 *
 * The worker imports ONLY `_lib` (BAR §4.7) and calls `analyzeVerdicts` — the
 * exact same pure core the synchronous fallback runs, so the two paths cannot
 * drift. Today that core is the placeholder measurement; the statistics
 * milestone swaps its body (parse → confusion → κ → α → baseline → bootstrap)
 * and keeps this envelope unchanged.
 *
 * The LRU below is the artifact seam: entries are keyed by an input hash,
 * refreshed on hit, capped at ARTIFACT_CACHE_CAPACITY, and only error-free
 * results are cached.
 */

const artifactCache = new Map<string, PlaceholderStats>();

/** Cheap stable hash — FNV-1a over the payload that identifies the work. */
function hashInput(input: WorkerInputPayload): string {
  let hash = 0x811c9dc5;
  const source = `${input.verdictsText.length}:${input.rubric.length}:${input.settings.seed}:${input.settings.confidenceLevel}`;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function getCachedArtifacts(key: string): PlaceholderStats | undefined {
  const hit = artifactCache.get(key);
  if (hit !== undefined) {
    // Refresh recency (Map iterates in insertion order).
    artifactCache.delete(key);
    artifactCache.set(key, hit);
  }
  return hit;
}

function setCachedArtifacts(key: string, stats: PlaceholderStats): void {
  artifactCache.set(key, stats);
  if (artifactCache.size > ARTIFACT_CACHE_CAPACITY) {
    const oldest = artifactCache.keys().next().value;
    if (oldest !== undefined) artifactCache.delete(oldest);
  }
}

self.onmessage = (event: MessageEvent<WorkerInputPayload>) => {
  // Stale guard FIRST: a late reply from a superseded dispatch is dropped
  // before it can touch the cache or post a result.
  const { id, verdictsText } = event.data;
  const key = hashInput(event.data);

  try {
    const cached = getCachedArtifacts(key);
    const result = cached
      ? { ok: true as const, stats: cached }
      : analyzeVerdicts(verdictsText, {
          deadlineMs: WORKER_DEADLINE_MS,
          engine: "worker",
        });

    if (result.ok && !cached) {
      setCachedArtifacts(key, result.stats);
    }

    const payload: WorkerOutputPayload = result.ok
      ? { id, ok: true, error: null, degraded: false, stats: result.stats }
      : {
          id,
          ok: false,
          error: result.error,
          degraded: false,
          stats: null,
        };

    self.postMessage(payload);
  } catch (err) {
    // Last-resort envelope: still reports consistent character counts rather
    // than zeros (BAR §4.4).
    self.postMessage({
      id,
      ok: false,
      error:
        err instanceof Error ? err.message : "Unexpected error inside worker",
      degraded: false,
      stats: null,
    } satisfies WorkerOutputPayload);
  }
};
