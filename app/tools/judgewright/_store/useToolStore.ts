"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_SETTINGS,
  SAMPLE_RUBRIC,
  SAMPLE_VERDICTS,
} from "../_lib/presets";
import {
  STORAGE_KEY,
  STORAGE_VERSION,
} from "../_lib/constants";
import type {
  ComputationResult,
  JudgewrightSettings,
  PlaceholderStats,
} from "../_lib/types";

/** Screen-reader announcement payload; `seq` keys re-renders of identical text. */
export interface StatusAnnouncement {
  message: string;
  seq: number;
}

interface ToolState {
  // ── User content — the ONLY persisted slice (AC-24) ───────────────────────
  verdictsText: string;
  setVerdictsText: (verdictsText: string) => void;

  rubric: string;
  setRubric: (rubric: string) => void;

  settings: JudgewrightSettings;
  /** Per-key merge so a partial settings update never drops the seed. */
  updateSettings: (patch: Partial<JudgewrightSettings>) => void;

  // ── Settled pipeline output (transient) ──────────────────────────────────
  /** The placeholder report; becomes the full CalibrationReport at M1/M2. */
  stats: PlaceholderStats | null;

  // ── Processing state & telemetry (transient) ─────────────────────────────
  isProcessing: boolean;
  setIsProcessing: (isProcessing: boolean) => void;

  errorMessage: string | null;
  setErrorMessage: (errorMessage: string | null) => void;

  /** Worker health: null = unknown · true = off-main-thread · false = degraded. */
  isWorkerAvailable: boolean | null;
  setWorkerAvailable: (isWorkerAvailable: boolean) => void;

  /** True when the last settle came from the main-thread fallback. */
  degraded: boolean;

  // ── Transient UI chrome (never persisted) ────────────────────────────────
  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  isSamplesOpen: boolean;
  setSamplesOpen: (open: boolean) => void;

  /** Screen-reader announcements for async pipeline transitions. */
  statusAnnouncement: StatusAnnouncement | null;
  announceStatus: (message: string) => void;

  /**
   * Hot-path batch action: settles stats, error, degraded flag and (optionally)
   * the announcement in ONE set() — consumers never see an intermediate frame.
   */
  applyComputation: (
    result: ComputationResult,
    options?: { announce?: boolean }
  ) => void;

  reset: () => void;
}

// Module-level so both announcement paths share one monotonic counter without
// exposing bookkeeping state (announcements are per-context, never persisted).
let announcementSeq = 0;

function nextAnnouncement(message: string): StatusAnnouncement {
  return { message, seq: ++announcementSeq };
}

function settleAnnouncement(result: ComputationResult): string {
  if (result.error) {
    return `Analysis rejected: ${result.error}`;
  }
  if (!result.stats) {
    return "Analysis settled";
  }
  const { characterCount, wordCount } = result.stats;
  return `Analysis settled — ${characterCount.toLocaleString("en-US")} characters, ${wordCount.toLocaleString("en-US")} words`;
}

export const useToolStore = create<ToolState>()(
  persist(
    (set) => ({
      // Seeded first-run content so the instrument never boots blank; a
      // persisted session overrides these on rehydrate (see merge below).
      verdictsText: SAMPLE_VERDICTS,
      setVerdictsText: (verdictsText) => set({ verdictsText }),

      rubric: SAMPLE_RUBRIC,
      setRubric: (rubric) => set({ rubric }),

      settings: { ...DEFAULT_SETTINGS },
      updateSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch } })),

      stats: null,

      isProcessing: false,
      setIsProcessing: (isProcessing) => set({ isProcessing }),

      errorMessage: null,
      setErrorMessage: (errorMessage) => set({ errorMessage }),

      isWorkerAvailable: null,
      setWorkerAvailable: (isWorkerAvailable) => set({ isWorkerAvailable }),

      degraded: false,

      isCommandPaletteOpen: false,
      setCommandPaletteOpen: (isCommandPaletteOpen) =>
        set({ isCommandPaletteOpen }),

      isSamplesOpen: false,
      setSamplesOpen: (isSamplesOpen) => set({ isSamplesOpen }),

      statusAnnouncement: null,
      announceStatus: (message) =>
        set({ statusAnnouncement: nextAnnouncement(message) }),

      applyComputation: (result, options) =>
        set(() =>
          result.error || !result.ok
            ? {
                // A rejection clears the settled output — stale counts from
                // the previous paste must not survive a failed one.
                stats: null,
                degraded: result.degraded,
                errorMessage: result.error,
                statusAnnouncement: nextAnnouncement(
                  `Analysis rejected: ${result.error ?? "unknown error"}`
                ),
              }
            : {
                stats: result.stats,
                degraded: result.degraded,
                errorMessage: null,
                ...(options?.announce === false
                  ? {}
                  : {
                      statusAnnouncement: nextAnnouncement(
                        settleAnnouncement(result)
                      ),
                    }),
              }
        ),

      // A true Clear: wipes user content + settled output but preserves the
      // persisted settings and the transient UI-chrome booleans.
      reset: () =>
        set({
          verdictsText: "",
          rubric: "",
          stats: null,
          errorMessage: null,
          statusAnnouncement: null,
        }),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      // Rehydrated explicitly after mount (see useToolWorker) so the server
      // HTML and the first client paint never disagree.
      skipHydration: true,
      // Content only — the theme key is NEVER merged into this store.
      partialize: (state) => ({
        verdictsText: state.verdictsText,
        rubric: state.rubric,
        settings: state.settings,
      }),
      // Future-proofing: v0/v1 payloads pass through; merge() below repairs
      // shape drift so version bumps stay additive.
      migrate: (persisted) => persisted as ToolState,
      merge: (persisted, current) => {
        const incoming = (persisted ?? {}) as Partial<ToolState>;
        return {
          ...current,
          ...incoming,
          // Defensive: hand-edited or older payloads may miss setting keys.
          settings: { ...DEFAULT_SETTINGS, ...(incoming.settings ?? {}) },
        };
      },
      storage: createJSONStorage(() => localStorage),
    }
  )
);
