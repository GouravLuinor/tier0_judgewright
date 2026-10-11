/**
 * Judgewright — position / verbosity bias panel (SPEC §2.1.6, AC-48, D3).
 *
 * Computed ONLY from columns that are actually present on the parsed rows.
 * Nothing is fabricated: if a bias metric's column is absent the value is
 * `null` and the panel names the missing column, so the copy can never imply a
 * number that this input cannot support (AC-48: "Position bias: 0.0 — needs a
 * position column" honest copy).
 *
 * Two signals, minimal but real:
 *   · position-bias  — from a `position` column (0 = first slot):
 *       P(first slot) − 0.5 (deviation of first-slot preference from even).
 *   · verbosity-bias — from a `preferred_longer` boolean column:
 *       P(preferred answer was the longer) − 0.5 (deviation of the weaker-argument
 *       preference from even).
 *
 * The deviation-from-even framing is the honest one-vsrest form of
 * "P(judge) − P(human)": with a single preference flag per comparison the split
 * between judge and human is not in the data, so the panel reports the raw
 * deviation instead of inventing two marginals.
 */

import type { BiasPanel, RawVerdict } from "./types.ts";

/** AC-48: the copy when neither signal is computable from the input. */
export const BIAS_NOT_COMPUTABLE_NOTE =
  "Not computable from your input — needs a `position` (0/1) column and/or a `preferred_longer` column.";

/**
 * The bias panel for a set of parsed rows. Every number below is either derived
 * from a present column or `null` with the missing column named — never a
 * fabricated value.
 */
export function biasMetrics(rows: readonly RawVerdict[]): BiasPanel {
  let positionN = 0;
  let positionFirst = 0;
  let verbosityN = 0;
  let verbosityLonger = 0;

  for (const row of rows) {
    if (row.position !== null && Number.isFinite(row.position)) {
      positionN += 1;
      if (row.position === 0) positionFirst += 1;
    }
    if (row.preferredLonger !== null) {
      verbosityN += 1;
      if (row.preferredLonger === true) verbosityLonger += 1;
    }
  }

  const positionBias =
    positionN > 0 ? positionFirst / positionN - 0.5 : null;
  const verbosityBias =
    verbosityN > 0 ? verbosityLonger / verbosityN - 0.5 : null;

  const missingColumns: string[] = [];
  if (positionBias === null) missingColumns.push("position");
  if (verbosityBias === null) missingColumns.push("preferred_longer");

  const computable = missingColumns.length < 2;
  const present: string[] = [];
  if (positionBias !== null) present.push("position");
  if (verbosityBias !== null) present.push("preferred_longer");

  const note = computable
    ? `Bias signals computed from ${present.join(" + ")} over the labelled rows.`
    : BIAS_NOT_COMPUTABLE_NOTE;

  return {
    computable,
    missingColumns,
    positionBias,
    positionN,
    verbosityBias,
    verbosityN,
    note,
  };
}
