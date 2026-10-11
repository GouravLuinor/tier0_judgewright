/**
 * Judgewright — verdict parser: JSONL + CSV → RawVerdict[] (SPEC §2.1).
 *
 * Errors are VALUES, never throws (BAR §4.4): every failure is a `ParseIssue`
 * carrying the EXACT line number, its class and a reason a user can act on.
 * Row issues skip one row and continue; hard errors (mixed vocabularies,
 * capacity, single-column input, ambiguity on id/label slots) abort the whole
 * parse with `verdicts: []` so no partial report is ever built from them.
 *
 * Both input forms converge on one raw-row model — a `Record<string, unknown>`
 * of source columns plus a line number — so JSONL and CSV share a single
 * validation path. That shared path is what makes the report identical for the
 * same logical rows whichever form they arrived in (AC-28).
 *
 * A6 — a leading UTF-8 BOM is stripped ONCE at the top, for BOTH forms: the
 * CSV tokenizer has always done it internally, and now the JSONL path does
 * too, so a BOM-prefixed JSONL file keeps its FIRST row instead of failing
 * the format sniff (a BOM before `{` read as "not jsonl") or the JSON parse.
 *
 * A10 — the row loop carries an OPTIONAL absolute wall-clock budget
 * (`ParseOptions.deadlineAt`), so a paste that cannot be materialized in time
 * settles a `capacity` error VALUE instead of holding the calling thread
 * (the main thread, on the fallback path) for as long as it likes.
 */

import { parseCsvRecords, stripBom } from "./csv.ts";
import {
  MAX_COLS,
  MAX_PARSE_ISSUES,
  MAX_ROWS,
  PARSE_DEADLINE_CHECK_ROWS,
} from "./constants.ts";
import { familyOf, normalizeLabel, vocabularyError } from "./labels.ts";
import type {
  ColumnMapping,
  ParseIssue,
  ParseIssueClass,
  ParseOptions,
  ParseResult,
  RawVerdict,
  VerdictFormat,
} from "./types";

// ── Column alias table (SPEC §2.1.2) ───────────────────────────────────────

const COLUMN_ALIASES: readonly {
  slot: keyof ColumnMapping;
  names: readonly string[];
}[] = [
  { slot: "exampleId", names: ["example_id", "id", "example", "uid"] },
  {
    slot: "judgeLabel",
    names: [
      "judge_label",
      "judge",
      "verdict",
      "prediction",
      "predicted_label",
      "judge_verdict",
    ],
  },
  {
    slot: "humanLabel",
    names: [
      "human_label",
      "gold_label",
      "label",
      "reference_label",
      "human",
      "expected",
    ],
  },
  { slot: "humanLabels", names: ["human_labels", "human_ratings", "raters"] },
  {
    slot: "judgeScore",
    names: ["judge_score", "judge_confidence", "confidence", "score", "probability"],
  },
  { slot: "humanScore", names: ["human_score", "human_confidence"] },
  {
    slot: "judgeCritique",
    names: ["judge_critique", "judge_reason", "judge_rationale", "reason"],
  },
  {
    slot: "humanCritique",
    names: ["human_critique", "human_reason", "human_rationale", "note"],
  },
  { slot: "position", names: ["position"] },
  { slot: "preferredLonger", names: ["preferred_longer"] },
  { slot: "input", names: ["input"] },
  { slot: "output", names: ["output"] },
];

/** Slots whose ambiguity is a HARD error (SPEC §2.1.5). */
const HARD_AMBIGUITY_SLOTS: readonly (keyof ColumnMapping)[] = [
  "exampleId",
  "judgeLabel",
  "humanLabel",
  "humanLabels",
];

const SLOT_LABELS: Record<keyof ColumnMapping, string> = {
  exampleId: "example_id",
  judgeLabel: "judge_label",
  humanLabel: "human_label",
  humanLabels: "human_labels",
  judgeScore: "judge_score",
  humanScore: "human_score",
  judgeCritique: "judge_critique",
  humanCritique: "human_critique",
  position: "position",
  preferredLonger: "preferred_longer",
  input: "input",
  output: "output",
};

/** Column/key lookup form: trimmed and lowercased. */
function columnKey(raw: string): string {
  return raw.trim().toLowerCase();
}

const EMPTY_MAPPING: ColumnMapping = {
  exampleId: null,
  judgeLabel: null,
  humanLabel: null,
  humanLabels: null,
  judgeScore: null,
  humanScore: null,
  judgeCritique: null,
  humanCritique: null,
  position: null,
  preferredLonger: null,
  input: null,
  output: null,
};

/**
 * Maps a CSV header onto the semantic slots, first match winning in header
 * order. `columnAmbiguities` detects two columns claiming one slot.
 */
export function mapColumns(header: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = { ...EMPTY_MAPPING };
  for (const cell of header) {
    const key = columnKey(cell);
    for (const { slot, names } of COLUMN_ALIASES) {
      if (mapping[slot] === null && names.includes(key)) {
        mapping[slot] = cell;
      }
    }
  }
  return mapping;
}

/** Slots claimed by more than one distinct header column, with the claimants. */
export function columnAmbiguities(
  header: readonly string[]
): { slot: keyof ColumnMapping; columns: string[] }[] {
  const claims = new Map<keyof ColumnMapping, string[]>();
  for (const cell of header) {
    const key = columnKey(cell);
    for (const { slot, names } of COLUMN_ALIASES) {
      if (!names.includes(key)) continue;
      const list = claims.get(slot) ?? [];
      if (!list.includes(cell)) list.push(cell);
      claims.set(slot, list);
    }
  }
  const conflicts: { slot: keyof ColumnMapping; columns: string[] }[] = [];
  for (const [slot, columns] of claims) {
    if (columns.length > 1) conflicts.push({ slot, columns });
  }
  return conflicts;
}

/**
 * Per-JSONL-row slot resolution: the first alias key present for each slot,
 * plus the ambiguity check for the id/label slots (SPEC §2.1.5).
 */
function resolveJsonlRow(
  keys: readonly string[]
): { mapping: ColumnMapping; conflict: { slot: keyof ColumnMapping; columns: string[] } | null } {
  const claims = new Map<keyof ColumnMapping, string[]>();
  for (const key of keys) {
    const normalized = columnKey(key);
    for (const { slot, names } of COLUMN_ALIASES) {
      if (!names.includes(normalized)) continue;
      const list = claims.get(slot) ?? [];
      if (!list.includes(key)) list.push(key);
      claims.set(slot, list);
    }
  }
  const mapping: ColumnMapping = { ...EMPTY_MAPPING };
  for (const [slot, columns] of claims) mapping[slot] = columns[0] ?? null;
  for (const [slot, columns] of claims) {
    if (columns.length > 1) return { mapping, conflict: { slot, columns } };
  }
  return { mapping, conflict: null };
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * "jsonl" when the first non-blank line starts with `{`, else "csv".
 * An empty paste defaults to jsonl (there is no header to read anyway).
 */
export function detectFormat(text: string): VerdictFormat {
  let index = 0;
  while (index < text.length) {
    const newline = text.indexOf("\n", index);
    const end = newline === -1 ? text.length : newline;
    const line = text.slice(index, end).trim();
    if (line.length > 0) return line.startsWith("{") ? "jsonl" : "csv";
    if (newline === -1) break;
    index = newline + 1;
  }
  return "jsonl";
}

// ── Raw row model ───────────────────────────────────────────────────────────

interface RawRow {
  /** Source columns → raw values (CSV always strings, JSONL as parsed). */
  values: Record<string, unknown>;
  line: number;
  /** Field count as it appeared, for the CSV width check. */
  fieldCount: number;
  /** True when the JSONL line could not be parsed as a JSON object. */
  malformed: boolean;
  excerpt: string;
}

function excerptOf(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
}

function jsonlRows(text: string): RawRow[] {
  const rows: RawRow[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    if (raw.trim().length === 0) continue;
    const excerpt = excerptOf(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      rows.push({ values: {}, line: i + 1, fieldCount: 0, malformed: true, excerpt });
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      rows.push({ values: {}, line: i + 1, fieldCount: 0, malformed: true, excerpt });
      continue;
    }
    const values = parsed as Record<string, unknown>;
    rows.push({ values, line: i + 1, fieldCount: Object.keys(values).length, malformed: false, excerpt });
  }
  return rows;
}

// ── Field extraction helpers ────────────────────────────────────────────────

function readString(row: RawRow, column: string | null): string | null {
  if (column === null) return null;
  const value = row.values[column];
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function readStringArray(row: RawRow, column: string | null): string[] | null {
  if (column === null) return null;
  const value = row.values[column];
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === "string" ? entry : String(entry)));
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return null;
}

interface ScoreRead {
  value: number | null;
  issue: string | null;
}

/**
 * Scores are `number | string | null`. A non-numeric or out-of-range value is
 * a line-numbered issue and the score is treated as ABSENT — never silently
 * clamped (SPEC §2.1.5 / AC-37).
 */
function readScore(row: RawRow, column: string | null, columnName: string): ScoreRead {
  if (column === null) return { value: null, issue: null };
  const value = row.values[column];
  if (value === undefined || value === null) return { value: null, issue: null };
  if (typeof value === "string" && value.trim().length === 0) {
    return { value: null, issue: null };
  }
  if (typeof value === "boolean") {
    return {
      value: null,
      issue: `line ${row.line}: ${columnName} "${String(value)}" is not a number in [0,1]`,
    };
  }

  const numeric = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric)) {
    const shown =
      typeof value === "number" ? String(value) : JSON.stringify(String(value));
    return {
      value: null,
      issue: `line ${row.line}: ${columnName} ${shown} is not a number in [0,1]`,
    };
  }
  if (numeric < 0 || numeric > 1) {
    return {
      value: null,
      issue: `line ${row.line}: ${columnName} ${String(numeric)} is outside [0,1] — treated as absent, never clamped`,
    };
  }
  return { value: numeric, issue: null };
}

function readPosition(row: RawRow, column: string | null): number | null {
  if (column === null) return null;
  const value = row.values[column];
  if (value === 0 || value === 1) return value;
  if (value === "0" || value === "1") return Number(value);
  return null;
}

function readPreferredLonger(row: RawRow, column: string | null): boolean | null {
  if (column === null) return null;
  const value = row.values[column];
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

// ── Row validation ──────────────────────────────────────────────────────────

function issue(
  line: number,
  cls: ParseIssueClass,
  reason: string,
  column?: string
): ParseIssue {
  return column === undefined ? { line, cls, reason } : { line, cls, column, reason };
}

interface RowOutcome {
  verdict: RawVerdict | null;
  issues: ParseIssue[];
  /** Raw labels of this row, in first-appearance order (vocabulary copy). */
  rawLabels: string[];
  /** The family each raw label belongs to, with its line (FM-2 report). */
  families: { family: string; line: number }[];
}

/** Validates one raw row into a RawVerdict (or the issues that sank it). */
function validateRow(row: RawRow, mapping: ColumnMapping): RowOutcome {
  const issues: ParseIssue[] = [];
  const rawLabels: string[] = [];
  const families: { family: string; line: number }[] = [];
  /** True when the row itself is unusable (a missing/non-string required field). */
  let rowDropped = false;

  const remember = (raw: string) => {
    if (!rawLabels.includes(raw)) rawLabels.push(raw);
    const family = familyOf(normalizeLabel(raw));
    if (family !== null && !families.some((entry) => entry.family === family)) {
      families.push({ family, line: row.line });
    }
  };

  const exampleIdRaw = readString(row, mapping.exampleId);
  if (exampleIdRaw === null || exampleIdRaw.trim().length === 0) {
    rowDropped = true;
    issues.push(
      issue(row.line, "missing-field", `line ${row.line}: missing "example_id"`)
    );
  }

  const judgeRaw = readString(row, mapping.judgeLabel);
  const judgeValue = row.values[mapping.judgeLabel ?? ""];
  if (judgeRaw === null || judgeRaw.trim().length === 0) {
    rowDropped = true;
    issues.push(
      issue(row.line, "missing-field", `line ${row.line}: missing "judge_label"`)
    );
  } else if (typeof judgeValue !== "string") {
    rowDropped = true;
    issues.push(
      issue(
        row.line,
        "bad-value",
        `line ${row.line}: judge_label must be a string, got ${typeof judgeValue}`,
        "judge_label"
      )
    );
  } else {
    remember(judgeRaw.trim());
  }

  const humanArray = readStringArray(row, mapping.humanLabels);
  const humanRawSingle = readString(row, mapping.humanLabel);
  const humanValue = row.values[mapping.humanLabel ?? ""];
  let humanLabels: string[] | null = humanArray;
  if (humanLabels === null && humanRawSingle !== null && humanRawSingle.trim().length > 0) {
    if (typeof humanValue !== "string") {
      rowDropped = true;
      issues.push(
        issue(
          row.line,
          "bad-value",
          `line ${row.line}: human_label must be a string, got ${typeof humanValue}`,
          "human_label"
        )
      );
    } else {
      humanLabels = [humanRawSingle.trim()];
    }
  }
  if (humanLabels === null || humanLabels.length === 0) {
    rowDropped = true;
    issues.push(
      issue(row.line, "missing-field", `line ${row.line}: missing "human_label"`)
    );
  } else {
    for (const label of humanLabels) remember(label.trim());
  }

  // Score issues NEVER drop the row (SPEC §2.1.5): the score is treated as
  // absent and the labels still count. Only the missing/non-string required
  // fields above drop a row.
  const judgeScore = readScore(row, mapping.judgeScore, "judge_score");
  if (judgeScore.issue !== null) {
    issues.push(issue(row.line, "bad-value", judgeScore.issue, "judge_score"));
  }
  const humanScore = readScore(row, mapping.humanScore, "human_score");
  if (humanScore.issue !== null) {
    issues.push(issue(row.line, "bad-value", humanScore.issue, "human_score"));
  }

  if (
    rowDropped ||
    judgeRaw === null ||
    humanLabels === null ||
    exampleIdRaw === null
  ) {
    return { verdict: null, issues, rawLabels, families };
  }

  const verdict: RawVerdict = {
    exampleId: exampleIdRaw.trim(),
    judgeLabel: normalizeLabel(judgeRaw.trim()),
    humanLabels: humanLabels.map((label) => normalizeLabel(label.trim())),
    judgeScore: judgeScore.value,
    humanScore: humanScore.value,
    judgeCritique: readString(row, mapping.judgeCritique),
    humanCritique: readString(row, mapping.humanCritique),
    judgeInput: readString(row, mapping.input),
    judgeOutput: readString(row, mapping.output),
    position: readPosition(row, mapping.position),
    preferredLonger: readPreferredLonger(row, mapping.preferredLonger),
    lineNumber: row.line,
  };
  return { verdict, issues, rawLabels, families };
}

// ── Entry point ─────────────────────────────────────────────────────────────

function hardErrorResult(
  issues: ParseIssue[],
  format: VerdictFormat,
  columns: string[],
  mapping: ColumnMapping,
  warnings: string[],
  judgeScoreAmbiguous: boolean
): ParseResult {
  return {
    verdicts: [],
    issues,
    issueCount: issues.length,
    fatal: true,
    format,
    rowCount: 0,
    capped: false,
    columns,
    mapping,
    warnings,
    judgeScoreAmbiguous,
  };
}

/**
 * Parses pasted verdicts (JSONL or CSV) into raw verdict rows.
 *
 * Row issues skip exactly one row and continue. A hard error (mixed label
 * vocabularies, capacity, single-column input, ambiguity on an id/label slot)
 * returns `verdicts: []` with the issue attached, so the caller settles the
 * error envelope instead of a partial report.
 *
 * A6 — the BOM is stripped here, once, for BOTH forms. Without it a
 * BOM-prefixed JSONL paste sniffs as CSV (a BOM before `{` is not a `{`) and
 * then dies on the CSV header check, losing every row to a byte no user typed.
 *
 * A10 — `options.deadlineAt` arms the wall-clock budget. When it trips the
 * parse returns a `capacity` hard error naming the rows it DID materialize,
 * so the caller settles an honest error instead of a half-built report.
 */
export function parseVerdicts(text: string, options: ParseOptions = {}): ParseResult {
  // A6: strip one leading BOM before anything looks at the text.
  const source = stripBom(text);
  const format = detectFormat(source);
  const issues: ParseIssue[] = [];
  const warnings: string[] = [];
  const verdicts: RawVerdict[] = [];
  /** The HONEST total; `issues` keeps only the first MAX_PARSE_ISSUES. */
  let issueCount = 0;
  /**
   * A12: two columns/keys claiming the `judge_score` slot. Legal on the
   * labels, fatal to the calibration panel's meaning — plumbed to
   * `computeReport` so the panel is reported not computable.
   */
  let judgeScoreAmbiguous = false;
  /** A10: the absolute wall-clock boundary, when the caller arms one. */
  const deadlineAt = options.deadlineAt;

  const push = (entry: ParseIssue) => {
    issueCount += 1;
    if (issues.length < MAX_PARSE_ISSUES) issues.push(entry);
  };

  // ── CSV: the header comes first ─────────────────────────────────────────
  let columns: string[] = [];
  let mapping: ColumnMapping = EMPTY_MAPPING;
  let rows: RawRow[] = [];

  if (format === "csv") {
    const records = parseCsvRecords(source);
    columns = records[0]?.fields ?? [];
    mapping = mapColumns(columns);

    const hardFail = (cls: ParseIssueClass, reason: string, column?: string) =>
      hardErrorResult(
        [issue(1, cls, reason, column)],
        format,
        columns,
        mapping,
        warnings,
        judgeScoreAmbiguous
      );

    if (columns.length <= 1) {
      return hardFail(
        "structure",
        "line 1: single-column input: need at least example_id and one label column"
      );
    }
    if (columns.length > MAX_COLS) {
      return hardFail(
        "capacity",
        `line 1: header lists ${columns.length} columns — the limit is ${MAX_COLS}`
      );
    }
    for (const conflict of columnAmbiguities(columns)) {
      const others = conflict.columns.slice(1).join('", "');
      const reason = `line 1: two columns map to ${SLOT_LABELS[conflict.slot]}: "${conflict.columns[0] ?? ""}" and "${others}" — rename one`;
      if (HARD_AMBIGUITY_SLOTS.includes(conflict.slot)) {
        return hardFail("ambiguity", reason, conflict.columns[0]);
      }
      // A12: a duplicated judge_score column is legal on the labels, but the
      // score it would feed the calibration panel no longer has ONE meaning.
      if (conflict.slot === "judgeScore") judgeScoreAmbiguous = true;
      warnings.push(reason);
    }
    if (
      mapping.exampleId === null &&
      mapping.judgeLabel === null &&
      mapping.humanLabel === null &&
      mapping.humanLabels === null
    ) {
      // Nothing semantic in the header at all.
      return hardFail(
        "structure",
        "line 1: single-column input: need at least example_id and one label column"
      );
    }

    for (let i = 1; i < records.length; i++) {
      const record = records[i];
      if (!record) continue;
      const values: Record<string, unknown> = {};
      for (let c = 0; c < columns.length; c++) {
        values[columns[c] ?? ""] = record.fields[c] ?? "";
      }
      rows.push({
        values,
        line: record.line,
        fieldCount: record.fields.length,
        malformed: false,
        excerpt: excerptOf(record.fields.join(",")),
      });
    }
  } else {
    rows = jsonlRows(source);
  }

  // ── Rows ────────────────────────────────────────────────────────────────
  const seenIds = new Set<string>();
  const duplicateNotes: string[] = [];
  const rawLabelOrder: string[] = [];
  const familyFirstLine = new Map<string, number>();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (row === undefined) continue;

    // A10: the wall-clock budget, checked on an amortized cadence so a 200k
    // paste does not pay a clock read per row. On a trip the parse STOPS and
    // settles a capacity error naming the rows it materialized — never a
    // partial report the caller would mistake for a complete one.
    if (
      deadlineAt !== undefined &&
      rowIndex % PARSE_DEADLINE_CHECK_ROWS === 0 &&
      Date.now() > deadlineAt
    ) {
      const budget = options.budgetMs === undefined ? "" : ` in ${options.budgetMs} ms`;
      return hardErrorResult(
        [
          issue(
            row.line,
            "capacity",
            `line ${row.line}: parsing exceeded its time budget${budget} after ${verdicts.length.toLocaleString("en-US")} rows — split the paste or use the Web Worker path`
          ),
        ],
        format,
        columns,
        mapping,
        warnings,
        judgeScoreAmbiguous
      );
    }

    if (verdicts.length >= MAX_ROWS) {
      // Cap BEFORE analysis: stop materializing, keep counting honestly.
      continue;
    }

    let rowMapping = mapping;
    if (format === "jsonl") {
      if (row.malformed) {
        push(issue(row.line, "structure", `line ${row.line}: invalid JSON — could not parse`));
        continue;
      }
      const resolved = resolveJsonlRow(Object.keys(row.values));
      rowMapping = resolved.mapping;
      const conflict = resolved.conflict;
      if (conflict && HARD_AMBIGUITY_SLOTS.includes(conflict.slot)) {
        push(
          issue(
            row.line,
            "ambiguity",
            `line ${row.line}: two keys map to ${SLOT_LABELS[conflict.slot]}: "${conflict.columns[0] ?? ""}" and "${conflict.columns[1] ?? ""}" — rename one`,
            conflict.columns[0]
          )
        );
        continue;
      }
      if (conflict) {
        // A12: a duplicated judge_score slot is legal on the labels, but the
        // score column no longer has ONE meaning, so the calibration panel is
        // not computable. Any OTHER duplicated slot names what actually
        // happened instead of borrowing the calibration panel's story.
        if (conflict.slot === "judgeScore") {
          judgeScoreAmbiguous = true;
          warnings.push(
            `line ${row.line}: two keys map to ${SLOT_LABELS[conflict.slot]} — the calibration panel is not computable`
          );
        } else {
          warnings.push(
            `line ${row.line}: two keys map to ${SLOT_LABELS[conflict.slot]} — the first one is used`
          );
        }
      }
    } else if (row.fieldCount !== columns.length) {
      push(
        issue(
          row.line,
          "structure",
          `line ${row.line}: CSV row has ${row.fieldCount} fields, header has ${columns.length}`
        )
      );
      continue;
    }

    const outcome = validateRow(row, rowMapping);
    for (const entry of outcome.issues) push(entry);
    for (const label of outcome.rawLabels) {
      if (!rawLabelOrder.includes(label)) rawLabelOrder.push(label);
    }
    for (const entry of outcome.families) {
      if (!familyFirstLine.has(entry.family)) familyFirstLine.set(entry.family, entry.line);
    }

    const verdict = outcome.verdict;
    if (verdict === null) continue;

    if (seenIds.has(verdict.exampleId)) {
      // Both rows are kept and counted independently (AC-36, decision row 4).
      const note = `duplicate example_id "${verdict.exampleId}" — rows are counted independently`;
      if (!duplicateNotes.includes(note)) duplicateNotes.push(note);
    }
    seenIds.add(verdict.exampleId);
    verdicts.push(verdict);
  }

  // The honest total counts every data row seen, including the capped tail.
  const rowCount = rows.length;

  // ── The vocabulary hard error (FM-2) ─────────────────────────────────────
  if (verdicts.length > 0) {
    const familiesPresent = Array.from(familyFirstLine.keys());
    if (familiesPresent.length >= 2) {
      const reason = vocabularyError(rawLabelOrder);
      const line = familyFirstLine.get(familiesPresent[1] ?? "") ?? 1;
      return hardErrorResult(
        [issue(line, "vocabulary", reason ?? "mixed label vocabularies")],
        format,
        columns,
        mapping,
        warnings,
        judgeScoreAmbiguous
      );
    }
  }

  if (rowCount > MAX_ROWS) {
    warnings.push(
      `Results capped at ${MAX_ROWS.toLocaleString("en-US")} of ${rowCount.toLocaleString("en-US")} rows.`
    );
  }
  for (const note of duplicateNotes.slice(0, MAX_PARSE_ISSUES)) warnings.push(note);

  return {
    verdicts,
    issues,
    issueCount,
    fatal: false,
    format,
    rowCount,
    capped: rowCount > MAX_ROWS,
    columns,
    mapping,
    warnings,
    judgeScoreAmbiguous,
  };
}
