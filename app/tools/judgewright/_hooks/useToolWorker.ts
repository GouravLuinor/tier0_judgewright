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
  WATCHDOG_MS,
} from "../_lib/constants";
import type {
  ComputationResult,
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
 *   · 1.5s watchdog → terminate + respawn + a friendly error
 *   · ONE degradation path (`degradeToMainThread`) that runs the SAME pure
 *     core synchronously under the stricter SYNC_DEADLINE_MS
 *   · successes announce behind an 800ms trailing debounce; errors settle now
 */

/** Neutral in-flight crash copy — never let the watchdog verdict fabricate one. */
const WORKER_CRASH_ERROR = "Worker crashed — switched to main-thread mode";

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
  const setErrorMessage = useToolStore((s) => s.setErrorMessage);
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
      if (inFlightError) setErrorMessage(inFlightError);
      announceStatus(notice);
    },
    [
      clearDebounce,
      clearWatchdog,
      clearSuccessAnnouncement,
      setWorkerAvailable,
      setIsProcessing,
      setErrorMessage,
      announceStatus,
    ]
  );

  const handleResult = useCallback(
    (result: ComputationResult) => {
      if (result.error) {
        // Rejections settle immediately and must not be followed by a
        // trailing success ping from an earlier keystroke.
        clearSuccessAnnouncement();
        applyComputation(result);
        return;
      }
      applyComputation(result, { announce: false });
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
      if (event.data.id < requestIdRef.current) return;
      if (event.data.id === watchdogIdRef.current) clearWatchdog();

      setIsProcessing(false);
      handleResult(event.data);
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
        // extension-hostile environment) must never freeze the UI.
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

          setIsProcessing(false);
          setErrorMessage("Execution aborted — the compute budget was exceeded");
          announceStatus("Execution aborted — the compute budget was exceeded");
        }, WATCHDOG_MS);

        worker.postMessage({
          id,
          verdictsText: inputRef.current.verdictsText,
          rubric: inputRef.current.rubric,
          settings: inputRef.current.settings,
        } satisfies WorkerInputPayload);
        return;
      }

      // Synchronous fallback path — identical semantics via the shared core.
      try {
        const result = analyzeVerdicts(inputRef.current.verdictsText, {
          deadlineMs: SYNC_DEADLINE_MS,
          engine: "main-thread",
          seed: inputRef.current.settings.seed,
          confidenceLevel: inputRef.current.settings.confidenceLevel,
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
        setIsProcessing(false);
        setErrorMessage(
          err instanceof Error ? err.message : "Unexpected processing error"
        );
        announceStatus("Processing failed");
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
    setIsProcessing,
    setErrorMessage,
    announceStatus,
    clearDebounce,
    clearWatchdog,
    clearSuccessAnnouncement,
  ]);
}
