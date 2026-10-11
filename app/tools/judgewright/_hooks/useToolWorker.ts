"use client";

import { useCallback, useEffect, useRef } from "react";
import { analyzeVerdicts } from "../_lib/analyze";
import {
  DEBOUNCE_LARGE_MS,
  DEBOUNCE_MEDIUM_MS,
  DEBOUNCE_MEDIUM_MAX_CHARS,
  DEBOUNCE_SMALL_MAX_CHARS,
  DEBOUNCE_SMALL_MS,
  DEBOUNCE_XLARGE_MAX_CHARS,
  DEBOUNCE_XLARGE_MS,
  SUCCESS_ANNOUNCE_DEBOUNCE_MS,
  SYNC_DEADLINE_MS,
  watchdogMsFor,
} from "../_lib/constants";
import type {
  ComputationResult,
  DisagreementWindow,
  WorkerInputPayload,
  WorkerOutputPayload,
} from "../_lib/types";
import { useToolStore } from "../_store/useToolStore";

/**
 * Owns the Web Worker lifecycle and debounced dispatch of verdict workloads.
 *
 * Contract (BAR §4.3, ARCHITECTURE §5), verbatim from the sibling pattern:
 *   · monotonic request ids with a stale-response guard (newest wins)
 *   · adaptive debounce by input length: 0 / 40 / 120 / 250 ms
 *   · a watchdog tiered by payload size (`watchdogMsFor`) → terminate +
 *     respawn + an atomically-settled error (A2: an in-cap 200k dispatch is
 *     never aborted at the small-paste wall)
 *   · ONE degradation path (`degradeToMainThread`) that runs the SAME pure
 *     core synchronously under the stricter SYNC_DEADLINE_MS
 *   · successes announce behind an 800ms trailing debounce; errors settle now
 */

/** Neutral in-flight crash copy — never let the watchdog verdict fabricate one. */
const WORKER_CRASH_ERROR = "Worker crashed — switched to main-thread mode";

/** A2: the watchdog verdict — an honest budget story, never a fabricated one. */
const WATCHDOG_ABORT_ERROR =
  "Execution aborted — the compute budget was exceeded";

/**
 * The stale-response guard (BAR §4.3), extracted so the worker protocol is
 * unit-testable without a DOM: a reply older than the newest dispatch is
 * dropped BEFORE it can touch state.
 */
export function isStaleReply(replyId: number, currentRequestId: number): boolean {
  return replyId < currentRequestId;
}

function debounceFor(length: number): number {
  if (length > DEBOUNCE_XLARGE_MAX_CHARS) return DEBOUNCE_XLARGE_MS;
  if (length > DEBOUNCE_MEDIUM_MAX_CHARS) return DEBOUNCE_LARGE_MS;
  if (length > DEBOUNCE_SMALL_MAX_CHARS) return DEBOUNCE_MEDIUM_MS;
  return DEBOUNCE_SMALL_MS;
}

export function useToolWorker() {
  const verdictsText = useToolStore((s) => s.verdictsText);
  const rubric = useToolStore((s) => s.rubric);
  const settings = useToolStore((s) => s.settings);

  const applyComputation = useToolStore((s) => s.applyComputation);
  const setIsProcessing = useToolStore((s) => s.setIsProcessing);
  const setWorkerAvailable = useToolStore((s) => s.setWorkerAvailable);
  const announceStatus = useToolStore((s) => s.announceStatus);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Dispatch id protected by the armed watchdog; -1 while disarmed. */
  const watchdogIdRef = useRef(-1);
  const successAnnounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // Mirrors store inputs so timers/watchdog read fresh values without
  // subscribing to volatile state (keeps effect deps stable).
  const inputRef = useRef({ verdictsText, rubric, settings });
  inputRef.current = { verdictsText, rubric, settings };

  const degradedRef = useRef(false);

  // Rehydrate persisted user content after mount (skipHydration in store).
  // The resulting state change re-triggers the dispatch effect below.
  useEffect(() => {
    void useToolStore.persist.rehydrate();
  }, []);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = null;
    watchdogIdRef.current = -1;
  }, []);

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
  }, []);

  const clearSuccessAnnouncement = useCallback(() => {
    if (successAnnounceTimerRef.current)
      clearTimeout(successAnnounceTimerRef.current);
    successAnnounceTimerRef.current = null;
  }, []);

  /**
   * Single degradation path: kills timers and the dead worker, flips every
   * pipeline flag and announces once — no orphan workers, no spinning state.
   */
  const degradeToMainThread = useCallback(
    (notice: string, inFlightError?: string) => {
      degradedRef.current = true;
      clearDebounce();
      clearWatchdog();
      clearSuccessAnnouncement();
      workerRef.current?.terminate();
      workerRef.current = null;
      setWorkerAvailable(false);
      setIsProcessing(false);
      if (inFlightError) {
        // A5: settle atomically through the store's ONE atomic action — the
        // in-flight failure clears the previous paste's numbers in the SAME
        // set() that records the error, so an error and a stale stat card
        // can never render together.
        applyComputation({
          ok: false,
          error: inFlightError,
          degraded: true,
          stats: null,
        });
      }
      announceStatus(notice);
    },
    [
      applyComputation,
      clearDebounce,
      clearWatchdog,
      clearSuccessAnnouncement,
      setWorkerAvailable,
      setIsProcessing,
      announceStatus,
    ]
  );

  const handleResult = useCallback(
    (result: ComputationResult, window?: DisagreementWindow) => {
      if (result.error) {
        // Rejections settle immediately and must not be followed by a
        // trailing success ping from an earlier keystroke.
        clearSuccessAnnouncement();
        applyComputation(result);
        return;
      }
      applyComputation(result, { announce: false, window });
      // Successes trail so a burst of keystrokes collapses into one
      // screen-reader update.
      clearSuccessAnnouncement();
      successAnnounceTimerRef.current = setTimeout(() => {
        successAnnounceTimerRef.current = null;
        const stats = useToolStore.getState().stats;
        announceStatus(
          stats
            ? `Report settled — ${stats.report.n.toLocaleString("en-US")} rows analyzed`
            : "Analysis settled"
        );
      }, SUCCESS_ANNOUNCE_DEBOUNCE_MS);
    },
    [applyComputation, announceStatus, clearSuccessAnnouncement]
  );

  const onWorkerMessage = useCallback(
    (event: MessageEvent<WorkerOutputPayload>) => {
      // Stale-response guard FIRST: a late reply must never touch state or
      // the watchdog protecting a newer dispatch (the C1 race).
      if (isStaleReply(event.data.id, requestIdRef.current)) return;
      if (event.data.id === watchdogIdRef.current) clearWatchdog();

      setIsProcessing(false);
      handleResult(event.data, event.data.disagreementWindow);
    },
    [clearWatchdog, handleResult, setIsProcessing]
  );

  const onWorkerError = useCallback(() => {
    // Worker died at runtime — settle everything instead of letting an armed
    // watchdog later fabricate a verdict over the corpse.
    const hadInFlight = watchdogIdRef.current !== -1;
    degradeToMainThread(
      "Worker unavailable — computing on the main thread (same core, CIs capped)",
      hadInFlight ? WORKER_CRASH_ERROR : undefined
    );
  }, [degradeToMainThread]);

  const onWorkerMessageError = useCallback(() => {
    // Structured-clone failures surface here; mirror onerror settling.
    const hadInFlight = watchdogIdRef.current !== -1;
    degradeToMainThread(
      "Worker unavailable — computing on the main thread (same core, CIs capped)",
      hadInFlight ? WORKER_CRASH_ERROR : undefined
    );
  }, [degradeToMainThread]);

  /** Sole worker factory — initial mount and watchdog respawn both route here. */
  const spawnWorker = useCallback((): Worker | null => {
    try {
      const worker = new Worker(
        new URL("../_workers/compute.worker.ts", import.meta.url)
      );
      worker.onmessage = onWorkerMessage;
      worker.onerror = onWorkerError;
      worker.onmessageerror = onWorkerMessageError;
      return worker;
    } catch (err) {
      console.warn("Worker initialization failed:", err);
      degradeToMainThread(
        "Worker unavailable — computing on the main thread (same core, CIs capped)"
      );
      return null;
    }
  }, [onWorkerMessage, onWorkerError, onWorkerMessageError, degradeToMainThread]);

  useEffect(() => {
    const worker = spawnWorker();
    workerRef.current = worker;
    if (worker) setWorkerAvailable(true);

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      clearDebounce();
      clearWatchdog();
      clearSuccessAnnouncement();
    };
  }, [
    spawnWorker,
    setWorkerAvailable,
    clearDebounce,
    clearWatchdog,
    clearSuccessAnnouncement,
  ]);

  // Dispatch work whenever the verdict session changes.
  useEffect(() => {
    setIsProcessing(true);

    clearDebounce();
    clearWatchdog();

    debounceTimerRef.current = setTimeout(() => {
      const id = ++requestIdRef.current;
      const worker = workerRef.current;

      if (!degradedRef.current && worker) {
        // Watchdog: an unkillable hang inside the worker (a bug, or an
        // extension-hostile environment) must never freeze the UI. A2: the
        // budget is TIERED by payload size — an in-cap 200k-row dispatch
        // legitimately needs seconds, and a flat 1.5s wall would abort it and
        // discard a report AC-27/AC-59 promise.
        watchdogIdRef.current = id;
        watchdogRef.current = setTimeout(() => {
          worker.terminate();
          if (workerRef.current === worker) workerRef.current = null;
          clearWatchdog();

          // Bump the request id so any zombie response is stale by definition,
          // then replace the worker unless we have already degraded.
          requestIdRef.current++;
          if (!degradedRef.current) {
            workerRef.current = spawnWorker();
          }

          // A5: the abort settles ATOMICALLY through the store's one action —
          // stats and the window are cleared in the same set() that records
          // the error, so the previous paste's numbers never render beside it.
          setIsProcessing(false);
          applyComputation({
            ok: false,
            error: WATCHDOG_ABORT_ERROR,
            degraded: false,
            stats: null,
          });
        }, watchdogMsFor(inputRef.current.verdictsText.length));

        worker.postMessage({
          id,
          verdictsText: inputRef.current.verdictsText,
          rubric: inputRef.current.rubric,
          settings: inputRef.current.settings,
        } satisfies WorkerInputPayload);
        return;
      }

      // Synchronous fallback path — identical semantics via the shared core.
      //
      // A10: `parseDeadlineArmed` is the ONE difference from the worker call,
      // and it exists because this path runs ON THE MAIN THREAD: an unbounded
      // parse of a pathological paste would freeze the UI for as long as it
      // liked, with no watchdog able to save it (there is no thread to
      // terminate). The parse therefore carries the SAME SYNC_DEADLINE_MS
      // budget the compute phases already used, and trips into a capacity
      // error VALUE instead of a freeze. The worker path is unaffected.
      try {
        const result = analyzeVerdicts(inputRef.current.verdictsText, {
          deadlineMs: SYNC_DEADLINE_MS,
          engine: "main-thread",
          parseDeadlineArmed: true,
          seed: inputRef.current.settings.seed,
          confidenceLevel: inputRef.current.settings.confidenceLevel,
          judgeScoreMode: inputRef.current.settings.judgeScoreMode,
          positiveClass: inputRef.current.settings.positiveClass,
          labelOrder: inputRef.current.settings.labelOrder,
        });
        if (id !== requestIdRef.current) return;
        setIsProcessing(false);
        handleResult({
          ok: result.ok,
          error: result.ok ? null : result.error,
          degraded: true,
          stats: result.ok ? result.stats : null,
          issues: result.ok ? [] : result.issues,
          issueCount: result.ok ? 0 : result.issueCount,
        });
      } catch (err) {
        clearSuccessAnnouncement();
        // A5: an unexpected throw settles the same atomic way — the error and
        // the cleared stats land together, never a stale card beside it.
        applyComputation({
          ok: false,
          error:
            err instanceof Error ? err.message : "Unexpected processing error",
          degraded: true,
          stats: null,
        });
      }
    }, debounceFor(verdictsText.length));

    return () => {
      clearDebounce();
      clearWatchdog();
    };
  }, [
    verdictsText,
    rubric,
    settings,
    handleResult,
    spawnWorker,
    applyComputation,
    setIsProcessing,
    announceStatus,
    clearDebounce,
    clearWatchdog,
    clearSuccessAnnouncement,
  ]);
}
