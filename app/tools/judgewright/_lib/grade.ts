/**
 * Judgewright — the letter grade (SPEC §2.2, AC-26, AC-39).
 *
 * The mapping is Landis & Koch (1977) — a CONVENTION, not a standard — and the
 * copy says so everywhere it is rendered. It is applied to the UNWEIGHTED κ
 * that carries the headline, so the adjacent-error fixture (AC-39) grades on
 * the unweighted coefficient even though its weighted rows are higher: a grade
 * that silently quoted a weighted κ would be a grade for a different measure.
 *
 * κ < 0 is worse than chance agreement — the judge disagrees more reliably
 * than a coin flip with the same marginals — and it is graded `F` with its own
 * label rather than folded into the "slight" band. A null κ is a dash: no
 * coefficient, no grade, no fabrication (FM-12).
 */

import type { KappaWeights } from "./types.ts";

export interface GradeBand {
  /** Lower bound, inclusive. */
  min: number;
  grade: string;
  label: string;
}

/**
 * Landis–Koch bands, descending by lower bound. The negative band is checked
 * BEFORE the table so κ < 0 carries "worse than chance" rather than "slight".
 */
export const GRADE_BANDS: readonly GradeBand[] = [
  { min: 0.8, grade: "A", label: "almost perfect" },
  { min: 0.6, grade: "B", label: "substantial" },
  { min: 0.4, grade: "C", label: "moderate" },
  { min: 0.2, grade: "D", label: "fair" },
  { min: Number.NEGATIVE_INFINITY, grade: "F", label: "slight" },
];

/** AC-26: the convention is disclosed wherever a grade is rendered. */
export const GRADE_CONVENTION_COPY =
  "A–F bands are the Landis–Koch convention applied to unweighted κ — a convenience mapping, not a standard";

/** AC-26: the below-chance label for a negative coefficient. */
export const GRADE_NEGATIVE_LABEL = "worse than chance";

/** AC-57: the headline copy for a negative κ. */
export const NEGATIVE_KAPPA_COPY =
  "κ is negative — the judge disagrees systematically";

/** No coefficient ⇒ no grade. The dash is the honest value. */
export const GRADE_UNDEFINED = "—";

/**
 * The letter grade for an unweighted κ. Null (the κ is undefined) is a dash,
 * never a letter.
 */
export function letterGrade(kappa: number | null): string {
  if (kappa === null || !Number.isFinite(kappa)) return GRADE_UNDEFINED;
  if (kappa < 0) return "F";
  for (const band of GRADE_BANDS) {
    if (kappa >= band.min) return band.grade;
  }
  return GRADE_UNDEFINED;
}

/** The human label paired with `letterGrade` (Landis–Koch vocabulary). */
export function landisKochLabel(kappa: number | null): string {
  if (kappa === null || !Number.isFinite(kappa)) return "";
  if (kappa < 0) return GRADE_NEGATIVE_LABEL;
  for (const band of GRADE_BANDS) {
    if (kappa >= band.min) return band.label;
  }
  return "";
}

/**
 * The copy for the grade row: the band, the label and the disclosure that the
 * bands are a convenience mapping over unweighted κ.
 */
export function gradeCopy(kappa: number | null): string {
  const grade = letterGrade(kappa);
  const label = landisKochLabel(kappa);
  if (grade === GRADE_UNDEFINED) return "κ undefined — no letter grade";
  return `${grade} — ${label} (${GRADE_CONVENTION_COPY})`;
}

/**
 * Which coefficient the grade is computed on. The tool never grades a weighted
 * κ, so this is a fixed disclosure rather than a switch — the parameter exists
 * so a future caller cannot pass a weighted row through by accident.
 */
export const GRADEBASIS: KappaWeights = "unweighted";
