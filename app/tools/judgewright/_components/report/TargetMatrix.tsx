"use client";

import { cn } from "@/lib/utils";
import type { CalibrationReport } from "../../_lib/types";
import { useToolStore } from "../../_store/useToolStore";

const LABEL_SLOTS = 8;

/** The identity patch for a label: its slot in the ColorChecker label palette. */
export function labelColor(labels: readonly string[], label: string): string {
  const index = labels.indexOf(label);
  return `var(--label-${(index < 0 ? 0 : index) % LABEL_SLOTS})`;
}

export function LabelSwatch({ labels, label, className }: { labels: readonly string[]; label: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("patch inline-block h-2.5 w-2.5 shrink-0", className)}
      style={{ backgroundColor: `rgb(${labelColor(labels, label)})` }}
    />
  );
}

/**
 * The target matrix: rows are the human (reference) label, columns the
 * judge's. Each cell is a split patch, top-left the human label's colour and
 * bottom-right the judge's, so the diagonal reads as solid patches and every
 * confusion reads as two colours that don't match. Clicking a cell narrows the
 * inspector to those rows.
 */
export function TargetMatrix({ report }: { report: CalibrationReport }) {
  const cellFilter = useToolStore((s) => s.cellFilter);
  const setCellFilter = useToolStore((s) => s.setCellFilter);
  const setFocusedRow = useToolStore((s) => s.setFocusedRow);
  const { labels, matrix, rowTotals, colTotals } = report.confusion;

  return (
    <div className="min-w-0">
      <div className="overflow-x-auto">
        <table className="figures border-separate border-spacing-[3px] font-mono text-sm">
          <caption className="mb-2 text-left font-sans text-sm text-ink-2">
            Rows: what your humans said. Columns: what the judge said.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="px-1 text-left font-sans text-xs font-normal text-ink-3">
                human ↓ judge →
              </th>
              {labels.map((label) => (
                <th key={label} scope="col" className="px-1 pb-1 text-left align-bottom font-normal text-ink-2">
                  <span className="flex items-center gap-1.5">
                    <LabelSwatch labels={labels} label={label} />
                    <span className="max-w-[7rem] truncate">{label}</span>
                  </span>
                </th>
              ))}
              <th scope="col" className="px-1 pb-1 text-right align-bottom font-sans text-xs font-normal text-ink-3">
                total
              </th>
            </tr>
          </thead>
          <tbody>
            {labels.map((human, r) => (
              <tr key={human}>
                <th scope="row" className="pr-2 text-left font-normal text-ink-2">
                  <span className="flex items-center gap-1.5">
                    <LabelSwatch labels={labels} label={human} />
                    <span className="max-w-[7rem] truncate">{human}</span>
                  </span>
                </th>
                {labels.map((judge, c) => {
                  const count = matrix[r]?.[c] ?? 0;
                  const active = cellFilter?.human === human && cellFilter.judge === judge;
                  const name = `${count.toLocaleString("en-US")} rows: humans said ${human}, judge said ${judge}`;
                  return (
                    <td key={judge} className="p-0">
                      <button
                        type="button"
                        disabled={count === 0}
                        aria-pressed={active}
                        aria-label={`${name}. Show these rows`}
                        title={name}
                        onClick={() => {
                          setFocusedRow(null);
                          setCellFilter(active ? null : { human, judge });
                        }}
                        className={cn(
                          "patch relative grid h-14 w-14 place-items-center transition-[outline-color] duration-150 sm:h-16 sm:w-16",
                          count === 0 ? "bg-sunk" : "patch-split",
                          active ? "outline outline-2 outline-offset-2 outline-select" : "outline outline-2 outline-offset-2 outline-transparent hover:outline-line-strong"
                        )}
                        style={
                          count === 0
                            ? undefined
                            : ({ "--ref": labelColor(labels, human), "--meas": labelColor(labels, judge) } as React.CSSProperties)
                        }
                      >
                        <span
                          className={cn(
                            "rounded-[2px] px-1 text-xs",
                            count === 0 ? "text-ink-3" : "bg-panel/90 text-ink"
                          )}
                        >
                          {count.toLocaleString("en-US")}
                        </span>
                      </button>
                    </td>
                  );
                })}
                <td className="pl-1 text-right text-ink-3">{(rowTotals[r] ?? 0).toLocaleString("en-US")}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pr-2 pt-1 text-left font-sans text-xs font-normal text-ink-3">
                total
              </th>
              {labels.map((label, c) => (
                <td key={label} className="px-1 pt-1 text-ink-3">
                  {(colTotals[c] ?? 0).toLocaleString("en-US")}
                </td>
              ))}
              <td className="pl-1 pt-1 text-right text-ink-2">{report.n.toLocaleString("en-US")}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 max-w-sm text-xs leading-relaxed text-ink-3">
        A solid patch means both said the same label. Two colours mean they
        disagreed. Select a patch to list those rows.
      </p>
    </div>
  );
}
