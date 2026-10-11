"use client";

import { useToolStore } from "../_store/useToolStore";
import type { JudgeScoreMode } from "../_lib/types";

/** A STABLE reference so the selector never re-renders in a loop (React #185). */
const NO_LABELS: readonly string[] = [];

/**
 * The two calibration controls (AC-40 / AC-51), placed in the workstation
 * toolbar. The score mode is a segmented control (never auto-detected — a
 * mismatch surfaces an amber hint in the report card instead); the positive
 * class defaults to the second sorted label and is a one-click override echoed
 * in the confusion header and the receipt.
 */
const SCORE_MODES: readonly {
  value: JudgeScoreMode;
  label: string;
  title: string;
}[] = [
  { value: "p-positive", label: "P(positive)", title: "The score is P(reference is positive)." },
  { value: "confidence", label: "Confidence", title: "The score is the judge's confidence in its own label." },
];

export function CalibrationControls() {
  const judgeScoreMode = useToolStore((s) => s.settings.judgeScoreMode);
  const updateSettings = useToolStore((s) => s.updateSettings);
  const stats = useToolStore((s) => s.stats);
  const labels = stats?.report.labels ?? NO_LABELS;
  const positiveClass = stats?.report.positiveClass ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Judge score mode"
        data-testid="score-mode-control"
        className="inline-flex overflow-hidden rounded-md border border-surface-border bg-surface-default"
      >
        {SCORE_MODES.map((mode) => {
          const active = judgeScoreMode === mode.value;
          return (
            <button
              key={mode.value}
              type="button"
              title={mode.title}
              aria-pressed={active}
              data-active={active ? "true" : "false"}
              onClick={() => updateSettings({ judgeScoreMode: mode.value })}
              className={
                active
                  ? "bg-brand-lime/15 px-2 py-1 font-mono text-[11px] font-medium text-brand-lime focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime/70"
                  : "px-2 py-1 font-mono text-[11px] text-zinc-400 hover:bg-surface-elevated/60 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime/70"
              }
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      {labels.length >= 2 && (
        <label className="inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
          <span>positive</span>
          <select
            data-testid="positive-class-select"
            aria-label="Positive class"
            value={positiveClass ?? labels[1] ?? ""}
            onChange={(event) => updateSettings({ positiveClass: event.target.value })}
            className="rounded-md border border-surface-border bg-surface-default px-1.5 py-1 font-mono text-[11px] text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime/70"
          >
            {labels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
