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
  ParseIssue,
  VerdictAnalysis,
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
  /**
   * The settled analysis: the D1 calibration report plus the honest counts of
   * the analyzed paste. Never persisted — user content is the only slice.
   */
  stats: VerdictAnalysis | null;

  /** First MAX_PARSE_ISSUES parse issues, for the pane's issue list. */
  parseIssues: ParseIssue[];
  /** The honest total of skipped-row issues (display caps at five). */
  parseIssueCount: number;

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
  const { report } = result.stats;
  const degradedNote = result.degraded ? " (main-thread fallback)" : "";
  return `Report settled — ${report.n.toLocaleString("en-US")} rows analyzed${degradedNote}`;
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
      parseIssues: [],
      parseIssueCount: 0,

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
        set(() => {
          const failure = result.error ?? (result.ok ? null : "Analysis failed");
          if (failure !== null || result.stats === null) {
            // A rejection clears the settled output — stale numbers from
            // the previous paste must not survive a failed one.
            return {
              stats: null,
              parseIssues: result.issues ?? [],
              parseIssueCount: result.issueCount ?? 0,
              degraded: result.degraded,
              errorMessage: failure,
              statusAnnouncement: nextAnnouncement(
                `Analysis rejected: ${failure ?? "unknown error"}`
              ),
            };
          }
          return {
            stats: result.stats,
            parseIssues: result.stats.parse.issues,
            parseIssueCount: result.stats.parse.issueCount,
            degraded: result.degraded,
            errorMessage: null,
            ...(options?.announce === false
              ? {}
              : {
                  statusAnnouncement: nextAnnouncement(
                    settleAnnouncement(result)
                  ),
                }),
          };
        }),

      // A true Clear: wipes user content + settled output but preserves the
      // persisted settings and the transient UI-chrome booleans.
      reset: () =>
        set({
          verdictsText: "",
          rubric: "",
          stats: null,
          parseIssues: [],
          parseIssueCount: 0,
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
