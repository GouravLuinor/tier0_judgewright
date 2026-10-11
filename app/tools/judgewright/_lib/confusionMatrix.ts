/**
 * Judgewright — confusion matrix + agreement metrics (SPEC §2.2, AC-51).
 *
 * Rows are the HUMAN labels, columns are the JUDGE labels, both sorted
 * ascending (plain lexical sort — the receipt prints the order it used). The
 * positive class for the binary metrics defaults to the SECOND sorted label
 * and is echoed everywhere it is used; the one-click selector arrives in D3.
 *
 * Every division by a zero denominator yields `null`, never NaN: a class the
 * judge never emitted has no precision, and that is a fact to print, not a
 * number to fabricate.
 */

import type {
  BinaryMetrics,
  ConfusionMatrix,
  MulticlassMetrics,
} from "./types";

/** Distinct labels across both raters, sorted ascending. */
export function sortedLabels(judge: readonly string[], human: readonly string[]): string[] {
  const set = new Set<string>();
  for (const label of judge) set.add(label);
  for (const label of human) set.add(label);
  return Array.from(set).sort();
}

/**
 * The confusion matrix: `matrix[humanIndex][judgeIndex]`, with human marginals
 * in `rowTotals` and judge marginals in `colTotals`.
 */
export function confusionMatrix(
  judge: readonly string[],
  human: readonly string[]
): ConfusionMatrix {
  const labels = sortedLabels(judge, human);
  const index = new Map<string, number>();
  labels.forEach((label, i) => index.set(label, i));

  const size = labels.length;
  const matrix: number[][] = [];
  for (let i = 0; i < size; i++) {
    matrix.push(new Array<number>(size).fill(0));
  }
  const rowTotals = new Array<number>(size).fill(0);
  const colTotals = new Array<number>(size).fill(0);

  const n = Math.min(judge.length, human.length);
  for (let i = 0; i < n; i++) {
    const humanIdx = index.get(human[i]);
    const judgeIdx = index.get(judge[i]);
    if (humanIdx === undefined || judgeIdx === undefined) continue;
    const row = matrix[humanIdx];
    if (!row) continue;
    row[judgeIdx] += 1;
    rowTotals[humanIdx] += 1;
    colTotals[judgeIdx] += 1;
  }

  return { labels, matrix, rowTotals, colTotals };
}

/**
 * The documented default positive class (SPEC §2.2 / AC-51): the SECOND
 * sorted label. Returns null when the session has fewer than two labels —
 * there is no positive class to measure against a single-class input.
 */
export function defaultPositiveClass(
  judge: readonly string[],
  human: readonly string[]
): string | null {
  const labels = sortedLabels(judge, human);
  if (labels.length < 2) return null;
  return labels[1] ?? null;
}

/** Safe division: a zero denominator is `null`, never NaN. */
function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

/**
 * TP / FP / TN / FN and the derived binary rates, measured against
 * `positive`. Callers that omit it should pass
 * `defaultPositiveClass(confusion)` — the second sorted label.
 */
export function binaryMetrics(
  judge: readonly string[],
  human: readonly string[],
  positive: string
): BinaryMetrics {
  const { labels, matrix } = confusionMatrix(judge, human);
  const positiveIdx = labels.indexOf(positive);

  if (positiveIdx === -1) {
    // The requested positive class is not in the data: nothing is measurable.
    return {
      tp: 0,
      fp: 0,
      tn: 0,
      fn: 0,
      tpr: null,
      tnr: null,
      ppv: null,
      fpr: null,
      f1: null,
      positiveClass: positive,
    };
  }

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (let h = 0; h < labels.length; h++) {
    for (let j = 0; j < labels.length; j++) {
      const cell = matrix[h]?.[j] ?? 0;
      const humanPositive = h === positiveIdx;
      const judgePositive = j === positiveIdx;
      if (humanPositive && judgePositive) tp += cell;
      else if (!humanPositive && judgePositive) fp += cell;
      else if (humanPositive && !judgePositive) fn += cell;
      else tn += cell;
    }
  }

  return {
    tp,
    fp,
    tn,
    fn,
    tpr: ratio(tp, tp + fn), // recall for the positive class
    tnr: ratio(tn, tn + fp),
    ppv: ratio(tp, tp + fp), // precision for the positive class
    fpr: ratio(fp, fp + tn),
    f1: ratio(2 * tp, 2 * tp + fp + fn),
    positiveClass: positive,
  };
}

/**
 * Per-label precision / recall / F1 plus the macro averages, computed from an
 * already-built confusion matrix (k-class report, SPEC §2.2).
 */
export function multiclassMetrics(m: ConfusionMatrix): MulticlassMetrics {
  const { labels, matrix, rowTotals, colTotals } = m;
  const perLabel = labels.map((label, i) => {
    const tp = matrix[i]?.[i] ?? 0;
    const support = rowTotals[i] ?? 0;
    const predicted = colTotals[i] ?? 0;
    return {
      label,
      precision: ratio(tp, predicted),
      recall: ratio(tp, support),
      f1: ratio(2 * tp, 2 * tp + (predicted - tp) + (support - tp)),
      support,
    };
  });

  const mean = (values: (number | null)[]): number | null => {
    const present = values.filter((v): v is number => v !== null);
    if (present.length === 0) return null;
    let sum = 0;
    for (const value of present) sum += value;
    return sum / present.length;
  };

  return {
    perLabel,
    macroPrecision: mean(perLabel.map((entry) => entry.precision)),
    macroRecall: mean(perLabel.map((entry) => entry.recall)),
    macroF1: mean(perLabel.map((entry) => entry.f1)),
  };
}
