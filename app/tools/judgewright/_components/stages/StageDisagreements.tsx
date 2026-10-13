"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToolStore } from "../../_store/useToolStore";

export function StageDisagreements() {
  const stats = useToolStore((s) => s.stats);
  const setActiveStage = useToolStore((s) => s.setActiveStage);
  const window = useToolStore((s) => s.disagreementWindow);

  const report = stats?.report;
  const rows = useMemo(() => {
    return window?.rows ?? report?.disagreements ?? [];
  }, [window, report]);
  const totalRows = window?.totalCount ?? report?.n ?? 0;

  const [disagreementsOnly, setDisagreementsOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = rows;
    if (disagreementsOnly) {
      list = list.filter((r) => !r.agree);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.exampleId.toLowerCase().includes(q) ||
          r.humanLabel.toLowerCase().includes(q) ||
          r.judgeLabel.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, disagreementsOnly, searchQuery]);

  if (!report) {
    return (
      <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-surface-border bg-surface-base p-8 text-center shadow-sm">
        <p className="text-xs text-zinc-400">Load verdicts first in Stage 1.</p>
        <Button
          type="button"
          onClick={() => setActiveStage("ingestion")}
          className="mt-4 h-9 rounded-xl bg-brand-lime px-4 text-xs font-semibold text-black transition-all hover:opacity-90 active:scale-[0.98]"
        >
          Go to Ingestion
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div
        className="rounded-2xl border border-surface-border bg-surface-base p-6 sm:p-7 shadow-sm space-y-4"
        data-disagreement-table
      >
        {/* Toolbar Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base sm:text-lg font-bold tracking-tight text-zinc-100">
              Failure &amp; Disagreement Inspector
            </h3>
            <p className="mt-1 text-xs text-zinc-400" data-disagreement-strip>
              {disagreementsOnly
                ? `${filtered.length.toLocaleString("en-US")} disagreements in display window`
                : `showing ${filtered.length.toLocaleString("en-US")} of ${totalRows.toLocaleString("en-US")} rows`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Search example_id or label…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 rounded-xl border border-surface-border bg-surface-subtle pl-9 pr-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-brand-lime focus:ring-1 focus:ring-brand-lime"
              />
            </div>

            <button
              type="button"
              onClick={() => setDisagreementsOnly(!disagreementsOnly)}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-mono transition-all active:scale-[0.98] ${
                disagreementsOnly
                  ? "border-brand-rose/40 bg-brand-rose/15 text-brand-rose font-bold"
                  : "border-surface-border bg-surface-subtle text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <TriangleAlert className="h-3.5 w-3.5" />
              <span>Disagreements Only</span>
            </button>
          </div>
        </div>

        {/* Interactive Table */}
        <div className="max-h-[520px] overflow-y-auto rounded-xl border border-surface-border bg-surface-subtle">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-surface-elevated border-b border-surface-border">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-zinc-400">
                  Line
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-zinc-400">
                  Example ID
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-zinc-400">
                  Human
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-zinc-400">
                  Judge
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-zinc-400">
                  Verdict
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-zinc-400">
                  Critique
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border/50">
              {filtered.map((row) => {
                const rowKey = `${row.lineNumber}-${row.exampleId}`;
                const isExpanded = expandedRow === rowKey;

                return (
                  <Fragment key={rowKey}>
                    <tr
                      data-agree={row.agree ? "true" : "false"}
                      onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                      className={`cursor-pointer transition-colors hover:bg-surface-elevated ${
                        row.agree ? "text-zinc-300" : "bg-brand-rose/[0.06] text-zinc-100"
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-zinc-500 tabular-nums">
                        {row.lineNumber}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-zinc-200">
                        {row.exampleId}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <span className="rounded-md bg-surface-base border border-surface-border px-2 py-0.5 text-zinc-300">
                          {row.humanLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <span
                          className={`rounded-md px-2 py-0.5 font-semibold ${
                            row.agree
                              ? "bg-brand-lime/15 text-brand-lime"
                              : "bg-brand-rose/20 text-brand-rose font-bold"
                          }`}
                        >
                          {row.judgeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {row.agree ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                            <CheckCircle2 className="h-3.5 w-3.5 text-brand-lime" /> agree
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-rose/20 px-2 py-0.5 text-[11px] font-bold uppercase text-brand-rose">
                            <TriangleAlert className="h-3.5 w-3.5" /> DISAGREE
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </td>
                    </tr>

                    {/* Expandable Critique Inspection */}
                    {isExpanded && (
                      <tr className="bg-surface-base">
                        <td colSpan={6} className="px-5 py-4 border-b border-surface-border">
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                            <div className="rounded-xl border border-surface-border bg-surface-subtle p-4">
                              <span className="text-xs font-semibold text-zinc-400">
                                Human Critique / Reference
                              </span>
                              <p className="mt-1.5 text-zinc-200 leading-relaxed text-xs sm:text-sm">
                                {row.humanCritique ?? "No human critique text provided in payload."}
                              </p>
                            </div>
                            <div className="rounded-xl border border-surface-border bg-surface-subtle p-4">
                              <span className="text-xs font-semibold text-zinc-400">
                                LLM Judge Rationale
                              </span>
                              <p className="mt-1.5 text-zinc-200 leading-relaxed text-xs sm:text-sm">
                                {row.judgeCritique ?? "No judge critique text provided in payload."}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stage Bottom Navigation Bar */}
      <div className="flex items-center justify-between rounded-2xl border border-surface-border bg-surface-subtle px-6 py-4 shadow-sm">
        <Button
          type="button"
          variant="outline"
          onClick={() => setActiveStage("matrix")}
          className="h-10 gap-2 rounded-xl border border-surface-border bg-surface-base text-xs font-semibold text-zinc-200 transition-all hover:bg-surface-elevated hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Confusion Matrix</span>
        </Button>

        <Button
          type="button"
          onClick={() => setActiveStage("bias")}
          className="h-10 gap-2 rounded-xl bg-zinc-100 px-6 text-xs font-bold text-zinc-950 transition-all hover:bg-white hover:shadow active:scale-[0.98]"
        >
          <span>Proceed to Bias Radar</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
