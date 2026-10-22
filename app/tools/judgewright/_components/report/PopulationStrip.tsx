"use client";

import { useMemo } from "react";
import { rowKey } from "../../_lib/display";
import type { DisagreementRow } from "../../_lib/types";
import { useToolStore } from "../../_store/useToolStore";

/**
 * Every row of the display window as one thin patch, in file order: agreeing
 * rows are a quiet green, disagreements are red. Clicking near a red patch
 * opens that row in the inspector. The strip draws the same window the table
 * lists, and says so when the set is larger.
 */
export function PopulationStrip({ rows, total }: { rows: DisagreementRow[]; total: number }) {
  const setFocusedRow = useToolStore((s) => s.setFocusedRow);
  const setCellFilter = useToolStore((s) => s.setCellFilter);
  const misses = useMemo(
    () => rows.reduce<number[]>((acc, row, i) => (row.agree ? acc : (acc.push(i), acc)), []),
    [rows]
  );

  if (rows.length === 0) return null;

  function open(fraction: number) {
    if (misses.length === 0) return;
    const target = Math.round(fraction * (rows.length - 1));
    let nearest = misses[0] ?? 0;
    for (const i of misses) {
      if (Math.abs(i - target) < Math.abs(nearest - target)) nearest = i;
    }
    const row = rows[nearest];
    if (!row) return;
    setCellFilter(null);
    setFocusedRow(rowKey(row));
    document.getElementById("failures")?.scrollIntoView({ block: "start" });
  }

  const shown = rows.length < total ? `first ${rows.length.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} rows` : `all ${total.toLocaleString("en-US")} rows`;

  return (
    <div>
      <button
        type="button"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          open(box.width > 0 && event.clientX > 0 ? (event.clientX - box.left) / box.width : 0);
        }}
        disabled={misses.length === 0}
        aria-label={
          misses.length === 0
            ? "Every row agrees"
            : `Open the nearest disagreement in the inspector (${misses.length.toLocaleString("en-US")} in this window)`
        }
        className="group block w-full rounded-[2px] disabled:cursor-default"
      >
        <svg
          viewBox={`0 0 ${rows.length} 1`}
          preserveAspectRatio="none"
          className="block h-6 w-full"
          aria-hidden="true"
        >
          {rows.map((row, i) => (
            <rect
              key={rowKey(row)}
              x={i}
              y={0}
              width={1}
              height={1}
              className={row.agree ? "fill-agree/40" : "fill-miss"}
              shapeRendering="crispEdges"
            />
          ))}
        </svg>
      </button>
      <p className="figures mt-1.5 flex justify-between gap-3 text-xs text-ink-3">
        <span>Each mark is one example, in file order ({shown}).</span>
        <span className="hidden whitespace-nowrap sm:inline">Click a red mark to inspect it</span>
      </p>
    </div>
  );
}
