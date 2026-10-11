/**
 * Judgewright — the per-example disagreement rows (SPEC §2.2, AC-16, AC-59, M5).
 *
 * The pure core builds one row per analyzed example: the human label(s), the
 * judge label, whether they agree, the optional scores and both critiques, plus
 * the source line number so a reviewer can find the row in the paste. That full
 * set is what an export or the LLM diagnosis consumes.
 *
 * The WORKER never structured-clones it: the payload carries a window of at
 * most `MAX_TABLE_ROWS` rows plus the true `totalCount` (AC-59 — at 200k rows
 * the window stays ≤ 2,000 while `totalCount === 200000`), and the pane says
 * "showing X of Y" instead of pretending it rendered everything (AC-16).
 */

import {
  DIAGNOSIS_DISAGREEMENT_LIMIT,
  MAX_TABLE_ROWS,
} from "./constants.ts";
import type { ConfusionMatrix, DisagreementRow, DisagreementWindow, RawVerdict } from "./types.ts";

/**
 * The full per-example table, in input order (line order, not agreement
 * order): the row order is the paste order so a row number means the same
 * thing here and in the editor.
 */
export function buildDisagreementRows(rows: readonly RawVerdict[]): DisagreementRow[] {
  return rows.map((row) => {
    const humanLabel = row.humanLabels[0] ?? "";
    return {
      exampleId: row.exampleId,
      humanLabel,
      humanLabels: [...row.humanLabels],
      judgeLabel: row.judgeLabel,
      agree: row.judgeLabel === humanLabel,
      judgeScore: row.judgeScore,
      humanScore: row.humanScore,
      judgeCritique: row.judgeCritique,
      humanCritique: row.humanCritique,
      judgeInput: row.judgeInput,
      judgeOutput: row.judgeOutput,
      lineNumber: row.lineNumber,
    };
  });
}

/**
 * One display window: `limit` rows from `offset` over the full table, with the
 * true total so the pane can name what it is not showing.
 */
export function disagreementWindowAt(
  rows: readonly DisagreementRow[],
  offset: number,
  limit: number = MAX_TABLE_ROWS
): DisagreementWindow {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(1, Math.floor(limit));
  return {
    offset: safeOffset,
    rows: rows.slice(safeOffset, safeOffset + safeLimit).map((row) => ({ ...row })),
    totalCount: rows.length,
  };
}

/**
 * M5 / AC-18: the ≤25 rows handed to the LLM diagnosis (the ranking rule is
 * `DIAGNOSIS_SELECTION_COPY`, rendered beside the selection). Ranking is by
 * confusion-cell frequency, but rows are drawn ROUND-ROBIN across distinct
 * cells — one row per cell per pass, highest-frequency cell first — so the
 * diagnosis sees every pattern the judge got wrong instead of 25 copies of its
 * single worst cell. Ties break on `exampleId` ascending, then line number.
 * Non-disagreements are never selected (they are not a failure to explain).
 */
export function selectDiagnosisDisagreements(
  rows: readonly DisagreementRow[],
  confusion: ConfusionMatrix,
  limit: number = DIAGNOSIS_DISAGREEMENT_LIMIT
): DisagreementRow[] {
  // Group the disagreements by their confusion cell (human label, judge label).
  const byCell = new Map<string, DisagreementRow[]>();
  for (const row of rows) {
    if (row.agree) continue;
    const key = `${row.humanLabel}\u0000${row.judgeLabel}`;
    const bucket = byCell.get(key);
    if (bucket === undefined) byCell.set(key, [row]);
    else bucket.push(row);
  }

  // Cells ranked by how many examples sit in them (the confusion matrix is the
  // authority for the frequency — it is already computed), ties on the labels.
  const ranked: { key: string; frequency: number; rows: DisagreementRow[] }[] = [];
  for (const [key, bucket] of byCell) {
    const row = bucket[0];
    if (row === undefined) continue;
    const humanIndex = confusion.labels.indexOf(row.humanLabel);
    const judgeIndex = confusion.labels.indexOf(row.judgeLabel);
    const frequency =
      humanIndex < 0 || judgeIndex < 0
        ? 0
        : (confusion.matrix[humanIndex]?.[judgeIndex] ?? 0);
    bucket.sort((a, b) =>
      a.exampleId === b.exampleId ? a.lineNumber - b.lineNumber : a.exampleId < b.exampleId ? -1 : 1
    );
    ranked.push({ key, frequency, rows: bucket });
  }
  ranked.sort((a, b) =>
    b.frequency === a.frequency
      ? a.key < b.key
        ? -1
        : 1
      : b.frequency - a.frequency
  );

  const selected: DisagreementRow[] = [];
  const cursors = ranked.map(() => 0);
  while (selected.length < limit) {
    let took = false;
    for (let c = 0; c < ranked.length && selected.length < limit; c++) {
      const cell = ranked[c];
      if (cell === undefined) continue;
      const next = cell.rows[cursors[c] ?? 0];
      if (next === undefined) continue;
      cursors[c] = (cursors[c] ?? 0) + 1;
      selected.push(next);
      took = true;
    }
    if (!took) break;
  }
  return selected;
}
