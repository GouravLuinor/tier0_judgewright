/**
 * Screen formatting and the plain-language verdict.
 *
 * Exports keep `sigFigs` (17 significant digits, byte-reproducible); the
 * screen reads two decimals with a true minus sign, so κ = 0.4 never renders
 * as "0.40000000000000002". Pure: no DOM, no IO, no transcendentals.
 */

import { GRADE_BANDS, GRADE_NEGATIVE_LABEL, landisKochLabel } from "./grade.ts";
import type { CalibrationReport } from "./types.ts";

const MINUS = "−";

/** A coefficient on screen: two decimals, U+2212 for negatives, "—" for null. */
export function coef(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const fixed = Math.abs(value).toFixed(2);
  // -0.001 rounds to "0.00": never print a signed zero.
  if (value < 0 && fixed !== "0.00") return `${MINUS}${fixed}`;
  return fixed;
}

/** A share as a percentage with one decimal. */
export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

/** Percentage points between two shares, one decimal. */
export function pp(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const fixed = Math.abs(value * 100).toFixed(1);
  return value < 0 && fixed !== "0.0" ? `${MINUS}${fixed} pp` : `${fixed} pp`;
}

/** An interval as "low to high", both ends formatted with `coef`. */
export function interval(low: number, high: number): string {
  return `${coef(low)} to ${coef(high)}`;
}

/**
 * Position of a coefficient on the shared −1…1 agreement scale, as a 0–100
 * percentage of the scale's width (clamped). Every marker on the scale (κ,
 * its interval, α, raw agreement, chance) uses this one mapping.
 */
export function scalePosition(value: number): number {
  if (!Number.isFinite(value)) return 50;
  const clamped = value < -1 ? -1 : value > 1 ? 1 : value;
  return ((clamped + 1) / 2) * 100;
}

/**
 * The Landis–Koch bands as steps on the shared scale, lowest first, with the
 * negative region as its own step. Used to draw the grey step wedge.
 */
export interface WedgeStep {
  from: number;
  to: number;
  label: string;
}

export function wedgeSteps(): WedgeStep[] {
  const ascending = [...GRADE_BANDS].reverse();
  const steps: WedgeStep[] = [{ from: -1, to: 0, label: GRADE_NEGATIVE_LABEL }];
  for (let i = 0; i < ascending.length; i++) {
    const band = ascending[i];
    const next = ascending[i + 1];
    if (!band) continue;
    const from = Number.isFinite(band.min) ? band.min : 0;
    steps.push({ from, to: next ? next.min : 1, label: band.label });
  }
  return steps;
}

export type VerdictTone = "trust" | "caution" | "distrust" | "undefined";

export interface VerdictReading {
  tone: VerdictTone;
  /** One sentence: can this judge be trusted? */
  headline: string;
  /** One or two sentences: why, in the user's numbers. */
  detail: string;
}

/**
 * The verdict a person reads first. The thresholds are the Landis–Koch bands
 * (a convention, disclosed in the method notes) plus one evidence rule: an
 * interval that reaches zero means the data cannot rule out a chance-level
 * judge, whatever the point estimate says.
 */
export function readVerdict(report: CalibrationReport): VerdictReading {
  const { kappa } = report;
  if (kappa === null) {
    return {
      tone: "undefined",
      headline: "Agreement can't be chance-corrected for this set.",
      detail:
        report.kappaUndefinedReason ??
        "κ needs at least two different labels in the data to correct for chance.",
    };
  }

  const band = landisKochLabel(kappa);
  const ci = report.ci.kappa;
  const detail = deflationSentence(report);

  if (kappa < 0) {
    return {
      tone: "distrust",
      headline: "Don't ship this judge: it disagrees with your humans more often than chance would.",
      detail,
    };
  }
  if (ci && ci.low <= 0) {
    return {
      tone: "caution",
      headline: `Not enough evidence yet: κ is ${coef(kappa)}, but the 95% interval reaches ${coef(ci.low)}, so a chance-level judge can't be ruled out.`,
      detail: `${detail} Label more rows to narrow the interval.`,
    };
  }
  if (kappa < 0.4) {
    return {
      tone: "distrust",
      headline: `Don't ship this judge as it is: once chance is removed, agreement is only ${band} (κ ${coef(kappa)}).`,
      detail,
    };
  }
  if (kappa < 0.6) {
    return {
      tone: "caution",
      headline: `Use with care: ${band} agreement once chance is removed (κ ${coef(kappa)}).`,
      detail,
    };
  }
  if (ci && ci.low < 0.6) {
    return {
      tone: "caution",
      headline: `Promising but not settled: κ is ${coef(kappa)} (${band}), and the interval dips to ${coef(ci.low)}.`,
      detail,
    };
  }
  return {
    tone: "trust",
    headline: `This judge tracks your humans: ${band} agreement once chance is removed (κ ${coef(kappa)}).`,
    detail,
  };
}

/** How much raw agreement flatters the judge, in the user's own numbers. */
export function deflationSentence(report: CalibrationReport): string {
  const raw = pct(report.rawAgreement);
  const base = pct(report.baseline.baselineAgreement);
  const majority = report.baseline.majorityClass;
  const always = `A judge that always answered “${majority}” would already agree ${base} of the time.`;
  if (report.deflation === null || report.kappa === null) {
    return `Raw agreement is ${raw}. ${always}`;
  }
  if (report.deflation >= 0.1) {
    return `Raw agreement says ${raw}, which flatters the judge by ${pp(report.deflation)}. ${always}`;
  }
  return `Raw agreement is ${raw}, close to the chance-corrected figure. ${always}`;
}

/** Stable identity for a per-example row: its source line plus its id. */
export function rowKey(row: { lineNumber: number; exampleId: string }): string {
  return `${row.lineNumber}-${row.exampleId}`;
}
