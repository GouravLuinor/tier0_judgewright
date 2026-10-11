/**
 * Judgewright — RFC 4180 CSV tokenizer (SPEC §2.1 / PLAN M1.3).
 *
 * Pure, allocation-conscious and line-honest: every record reports the 1-based
 * line it STARTS on, newlines inside quoted fields still advance the counter,
 * and `""` decodes to a single quote. A leading UTF-8 BOM is stripped so the
 * first header name is never `\uFEFFexample_id`.
 *
 * The tokenizer never throws and never interprets the payload: it returns raw
 * fields, and `parse.ts` decides what a field means. Blank lines (a record
 * with exactly one empty unquoted field) are skipped, so a trailing newline
 * does not manufacture a phantom row.
 */

/** One CSV record: raw fields plus the line it started on. */
export interface CsvRecord {
  fields: string[];
  line: number;
}

/** Removes one leading UTF-8 BOM (U+FEFF) if present. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Tokenizes CSV text into records.
 *
 * Field-per-comma, record-per-newline, honoring double quotes: a quoted field
 * may contain commas, CR/LF and `""` (an escaped quote). CRLF, LF and a lone
 * CR all terminate a record; the optional LF after a CR is consumed with it.
 */
export function parseCsvRecords(text: string): CsvRecord[] {
  const source = stripBom(text);
  const records: CsvRecord[] = [];

  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let recordHasContent = false;
  let recordLine = 1;
  let line = 1;

  const finishField = () => {
    fields.push(field);
    field = "";
  };

  const finishRecord = () => {
    finishField();
    // A record of exactly one empty unquoted field is a blank line: skip it.
    if (recordHasContent || fields.length > 1) {
      records.push({ fields, line: recordLine });
    }
    fields = [];
    recordHasContent = false;
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++; // the escaped pair counts as one quote
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n") line++;
        field += char;
      }
      continue;
    }

    switch (char) {
      case '"':
        inQuotes = true;
        recordHasContent = true;
        break;
      case ",":
        finishField();
        break;
      case "\r":
        finishRecord();
        // Consume the LF of a CRLF pair exactly once.
        if (source[i + 1] === "\n") i++;
        line++;
        recordLine = line;
        break;
      case "\n":
        finishRecord();
        line++;
        recordLine = line;
        break;
      default:
        field += char;
        // Any non-newline character means the record is not blank.
        if (char !== " " && char !== "\t") recordHasContent = true;
        break;
    }
  }

  // A final record without a trailing newline still counts.
  if (field.length > 0 || fields.length > 0 || inQuotes || recordHasContent) {
    finishRecord();
  }

  return records;
}
