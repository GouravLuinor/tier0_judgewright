"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_TABLE_ROWS } from "../../_lib/constants";
import { rowKey } from "../../_lib/display";
import type { CalibrationReport, DisagreementRow } from "../../_lib/types";
import { useToolStore } from "../../_store/useToolStore";
import { LabelSwatch, TargetMatrix } from "./TargetMatrix";

const count = (value: number) => value.toLocaleString("en-US");

/**
 * Where the judge and the humans part ways: the target matrix as a filter,
 * the per-example table, and an inspector that puts one row's two labels and
 * two critiques side by side. Selecting a row dims the rest of the table so
 * the row being read stays in view.
 */
export function DisagreementInspector({ report }: { report: CalibrationReport }) {
  const window = useToolStore((s) => s.disagreementWindow);
  const focusedRow = useToolStore((s) => s.focusedRow);
  const setFocusedRow = useToolStore((s) => s.setFocusedRow);
  const cellFilter = useToolStore((s) => s.cellFilter);
  const setCellFilter = useToolStore((s) => s.setCellFilter);
  const [disagreementsOnly, setDisagreementsOnly] = useState(false);
  const inspectorRef = useRef<HTMLDivElement>(null);

  const rows = window?.rows ?? report.disagreements;
  const totalRows = window?.totalCount ?? report.n;
  const windowMisses = useMemo(() => rows.filter((row) => !row.agree), [rows]);

  const visible = useMemo(() => {
    if (cellFilter) {
      return rows.filter((row) => row.humanLabel === cellFilter.human && row.judgeLabel === cellFilter.judge);
    }
    return disagreementsOnly ? windowMisses : rows;
  }, [rows, windowMisses, cellFilter, disagreementsOnly]);

  // The inspector always has something to show: the chosen row, else the
  // first disagreement in view, else the first row.
  const focused =
    (focusedRow && rows.find((row) => rowKey(row) === focusedRow)) ||
    visible.find((row) => !row.agree) ||
    visible[0] ||
    null;

  const missIndex = focused ? windowMisses.findIndex((row) => rowKey(row) === rowKey(focused)) : -1;

  function step(direction: 1 | -1) {
    if (windowMisses.length === 0) return;
    const from = missIndex < 0 ? (direction === 1 ? -1 : 0) : missIndex;
    const next = windowMisses[(from + direction + windowMisses.length) % windowMisses.length];
    if (!next) return;
    setCellFilter(null);
    setFocusedRow(rowKey(next));
  }

  const strip = cellFilter
    ? `${count(visible.length)} ${visible.length === 1 ? "row" : "rows"} where humans said “${cellFilter.human}” and the judge said “${cellFilter.judge}”, in this window of ${count(rows.length)}`
    : disagreementsOnly
      ? `${count(visible.length)} of ${count(windowMisses.length)} shown disagreements in this window`
      : `showing ${count(visible.length)} of ${count(totalRows)} rows — the table caps at ${count(MAX_TABLE_ROWS)}; the export and the diagnosis read this same window, so the numbers never differ by engine`;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-10">
      <div className="flex min-w-0 flex-col gap-8 lg:sticky lg:top-20 lg:self-start">
        <TargetMatrix report={report} />
        <div ref={inspectorRef}>
          <Inspector
            row={focused}
            labels={report.labels}
            position={missIndex}
            misses={windowMisses.length}
            onStep={step}
          />
        </div>
      </div>

      <section aria-label="Per-example rows" data-disagreement-table className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={disagreementsOnly}
              onChange={(event) => {
                setCellFilter(null);
                setDisagreementsOnly(event.target.checked);
              }}
              className="h-4 w-4 accent-[rgb(var(--select))]"
            />
            Disagreements only
          </label>
          {cellFilter && (
            <button
              type="button"
              onClick={() => setCellFilter(null)}
              className="inline-flex h-7 items-center gap-1.5 rounded-[3px] border border-select/60 bg-select/10 px-2 text-xs text-select-ink hover:bg-select/15"
            >
              {cellFilter.human} → {cellFilter.judge}
              <X className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Clear the matrix filter</span>
            </button>
          )}
        </div>
        <p data-disagreement-strip className="figures mt-2 text-xs leading-relaxed text-ink-3">
          {strip}
        </p>

        <div className="mt-3 max-h-[22rem] overflow-auto lg:max-h-[34rem] rounded-[3px] border border-line bg-panel">
          <table className="figures w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-sunk text-xs text-ink-2">
              <tr>
                {["line", "example", "human", "judge", "verdict"].map((head) => (
                  <th key={head} scope="col" className="border-b border-line px-3 py-2 font-medium">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const key = rowKey(row);
                const isFocused = focused !== null && key === rowKey(focused);
                return (
                  <tr
                    key={key}
                    data-agree={row.agree ? "true" : "false"}
                    aria-selected={isFocused}
                    onClick={() => setFocusedRow(key)}
                    className={cn(
                      "cursor-pointer border-b border-line/70 transition-opacity duration-150 last:border-b-0 hover:bg-sunk",
                      isFocused && "bg-select/10 hover:bg-select/10",
                      focusedRow !== null && !isFocused && "opacity-60 hover:opacity-100"
                    )}
                  >
                    <td className="px-3 py-1.5 font-mono text-xs text-ink-3">{row.lineNumber}</td>
                    <td className="max-w-[12rem] px-3 py-1.5 font-mono text-xs">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setFocusedRow(key);
                          if (globalThis.matchMedia?.("(max-width: 1023px)").matches) {
                            inspectorRef.current?.scrollIntoView({ block: "start" });
                          }
                        }}
                        className="block max-w-full truncate rounded-[2px] text-left text-ink hover:underline"
                      >
                        {row.exampleId}
                      </button>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs text-ink-2">
                      {row.humanLabels.length > 1 ? `${row.humanLabel} (+${row.humanLabels.length - 1})` : row.humanLabel}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs text-ink-2">{row.judgeLabel}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {row.agree ? (
                        <span className="text-ink-3">agree</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-medium tracking-wide text-miss-ink">
                          <span className="patch h-2 w-2 bg-miss" aria-hidden="true" />
                          DISAGREE
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visible.length === 0 && (
            <p className="px-3 py-6 text-sm text-ink-2">No rows match this filter.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Inspector({
  row,
  labels,
  position,
  misses,
  onStep,
}: {
  row: DisagreementRow | null;
  labels: string[];
  position: number;
  misses: number;
  onStep: (direction: 1 | -1) => void;
}) {
  if (!row) return null;

  return (
    <article aria-label="Selected example" aria-live="polite" className="rounded-[3px] border border-line bg-panel">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-mono text-sm text-ink">{row.exampleId}</h3>
          <p className="figures text-xs text-ink-3">
            line {row.lineNumber}
            {row.agree ? " · agree" : position >= 0 ? ` · disagreement ${count(position + 1)} of ${count(misses)}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onStep(-1)}
          disabled={misses === 0}
          aria-label="Previous disagreement"
          className="grid h-8 w-8 place-items-center rounded-[3px] text-ink-2 hover:bg-sunk hover:text-ink disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onStep(1)}
          disabled={misses === 0}
          aria-label="Next disagreement"
          className="grid h-8 w-8 place-items-center rounded-[3px] text-ink-2 hover:bg-sunk hover:text-ink disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="grid grid-cols-2 divide-x divide-line">
        <Side
          who="Human"
          label={row.humanLabels.length > 1 ? `${row.humanLabel} (+${row.humanLabels.length - 1})` : row.humanLabel}
          swatch={row.humanLabel}
          labels={labels}
          score={row.humanScore}
          critique={row.humanCritique}
        />
        <Side
          who="Judge"
          label={row.judgeLabel}
          swatch={row.judgeLabel}
          labels={labels}
          score={row.judgeScore}
          critique={row.judgeCritique}
          miss={!row.agree}
        />
      </div>

      {row.humanLabels.length > 1 && (
        <p className="border-t border-line px-4 py-2 font-mono text-xs text-ink-3">
          all human labels: {row.humanLabels.join(", ")}
        </p>
      )}

      {(row.judgeInput || row.judgeOutput) && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          {row.judgeInput && <Excerpt title="Input" text={row.judgeInput} />}
          {row.judgeOutput && <Excerpt title="Output judged" text={row.judgeOutput} />}
        </div>
      )}
    </article>
  );
}

function Side({
  who,
  label,
  swatch,
  labels,
  score,
  critique,
  miss = false,
}: {
  who: string;
  label: string;
  swatch: string;
  labels: string[];
  score: number | null;
  critique: string | null;
  miss?: boolean;
}) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-xs text-ink-3">{who}</p>
      <p className={cn("mt-1 flex items-center gap-2 font-mono text-base", miss ? "text-miss-ink" : "text-ink")}>
        <LabelSwatch labels={labels} label={swatch} className="h-3 w-3" />
        <span className="truncate">{label}</span>
      </p>
      {score !== null && <p className="figures mt-0.5 font-mono text-xs text-ink-3">score {score}</p>}
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        {critique ?? <span className="text-ink-3">No critique in the file.</span>}
      </p>
    </div>
  );
}

function Excerpt({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="text-xs text-ink-3">{title}</p>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-[2px] bg-sunk p-2 font-mono text-xs leading-relaxed text-ink-2">
        {text}
      </pre>
    </div>
  );
}
