"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { percent, sigFigs } from "../../_lib/reportRender";
import { bootstrapTierCopy } from "../../_lib/bootstrapCI";
import { useToolStore } from "../../_store/useToolStore";

export function StageMatrix() {
  const stats = useToolStore((s) => s.stats);
  const setActiveStage = useToolStore((s) => s.setActiveStage);

  if (!stats) {
    return (
      <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-surface-border bg-surface-base p-8 text-center shadow-sm">
        <h3 className="text-base font-bold text-zinc-100">No matrix available</h3>
        <p className="mt-1 text-xs text-zinc-400">
          Load or paste verdicts in Step 1 to generate the confusion matrix and reliability metrics.
        </p>
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

  const report = stats.report;

  // Compute maximum cell value to normalize cell intensity
  let maxCell = 1;
  for (const row of report.confusion.matrix) {
    for (const val of row) {
      if (val > maxCell) maxCell = val;
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Card: Confusion Matrix Heatmap */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-surface-border bg-surface-base p-6 shadow-sm">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base sm:text-lg font-bold tracking-tight text-zinc-100">
                  Confusion Matrix
                </h3>
                <p className="text-xs text-zinc-400">
                  Rows: Human Raters · Columns: LLM Judge
                </p>
              </div>
              <span className="rounded-full bg-surface-subtle border border-surface-border px-3 py-1 font-mono text-[11px] text-zinc-400">
                Sorted ({report.labels.join(" < ")})
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border border-surface-border bg-surface-subtle px-3.5 py-2.5 text-left font-mono text-[11px] text-zinc-400">
                      human \ judge
                    </th>
                    {report.labels.map((label) => (
                      <th
                        key={label}
                        className="border border-surface-border bg-surface-subtle px-3.5 py-2.5 text-center font-mono text-[11px] text-zinc-200 font-bold"
                      >
                        {label}
                      </th>
                    ))}
                    <th className="border border-surface-border bg-surface-subtle px-3.5 py-2.5 text-right font-mono text-[11px] text-zinc-400 font-semibold">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.confusion.matrix.map((row, h) => {
                    const rowLabel = report.labels[h] ?? String(h);
                    const rowTotal = report.confusion.rowTotals[h] ?? 0;
                    return (
                      <tr key={rowLabel} className="transition-colors hover:bg-surface-subtle/50">
                        <th className="border border-surface-border bg-surface-subtle/70 px-3.5 py-2.5 text-left font-mono text-[11px] text-zinc-300 font-semibold">
                          {rowLabel}
                        </th>
                        {row.map((cell, j) => {
                          const isDiagonal = h === j;
                          const ratio = maxCell > 0 ? cell / maxCell : 0;
                          return (
                            <td
                              key={report.labels[j] ?? String(j)}
                              className={`border border-surface-border px-3.5 py-2.5 text-center font-mono text-xs tabular-nums transition-colors ${
                                isDiagonal
                                  ? cell > 0
                                    ? "bg-brand-lime/15 text-brand-lime font-bold font-mono"
                                    : "text-zinc-500"
                                  : cell > 0
                                    ? "bg-brand-rose/15 text-brand-rose font-semibold"
                                    : "text-zinc-500"
                              }`}
                              style={{
                                opacity: cell > 0 ? Math.max(0.75, ratio) : 0.4,
                              }}
                            >
                              {cell.toLocaleString("en-US")}
                            </td>
                          );
                        })}
                        <td className="border border-surface-border bg-surface-subtle/40 px-3.5 py-2.5 text-right font-mono text-xs tabular-nums text-zinc-300 font-medium">
                          {rowTotal.toLocaleString("en-US")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-surface-border bg-surface-subtle/80 font-semibold">
                    <th className="border border-surface-border px-3.5 py-2.5 text-left font-mono text-[11px] text-zinc-400">
                      Total
                    </th>
                    {report.confusion.colTotals.map((total, j) => (
                      <td
                        key={report.labels[j] ?? String(j)}
                        className="border border-surface-border px-3.5 py-2.5 text-center font-mono text-xs tabular-nums text-zinc-200"
                      >
                        {total.toLocaleString("en-US")}
                      </td>
                    ))}
                    <td className="border border-surface-border px-3.5 py-2.5 text-right font-mono text-xs tabular-nums text-zinc-100 font-bold">
                      {report.n.toLocaleString("en-US")}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Right Card: Krippendorff's Alpha & Metrics */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-5 rounded-2xl border border-surface-border bg-surface-base p-6 shadow-sm">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-zinc-100">
                Krippendorff&rsquo;s α &amp; Metrics
              </h3>
              <span className="font-mono text-[11px] text-zinc-400">
                Level &ldquo;{report.alphaLevel}&rdquo;
              </span>
            </div>

            {/* Alpha Cards with Overflow Protection */}
            <div
              className="grid grid-cols-2 gap-3.5"
              data-alpha-panel={report.alphaLevel}
            >
              <div className="rounded-xl border border-surface-border bg-surface-subtle p-3.5 min-w-0 overflow-hidden">
                <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  α (Panel)
                </dt>
                <dd
                  className="mt-1 font-mono text-lg sm:text-xl font-bold text-zinc-100 tabular-nums truncate block w-full"
                  data-alpha-panel-value
                  title={report.alphaPanel === null ? "—" : sigFigs(report.alphaPanel)}
                >
                  {report.alphaPanel === null ? "—" : sigFigs(report.alphaPanel)}
                </dd>
                <dd className="mt-0.5 text-[10px] text-zinc-400">
                  chance-corrected
                </dd>
              </div>

              <div className="rounded-xl border border-surface-border bg-surface-subtle p-3.5 min-w-0 overflow-hidden">
                <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  α (Ceiling)
                </dt>
                <dd
                  className="mt-1 font-mono text-lg sm:text-xl font-bold text-zinc-300 tabular-nums truncate block w-full"
                  data-alpha-humans-value
                  title={report.alphaHumans === null ? "—" : sigFigs(report.alphaHumans)}
                >
                  {report.alphaHumans === null ? "—" : sigFigs(report.alphaHumans)}
                </dd>
                <dd className="mt-0.5 text-[10px] text-zinc-500">
                  needs ≥2 raters
                </dd>
              </div>

              {/* Disclosure notes */}
              <div className="sr-only" data-alpha-ci-restriction>
                the α point statistic uses every rater on a row; resamples a single judge-vs-first-human pair
              </div>
              <div className="sr-only">
                {
                  "with one human rater the panel is 2 coders, so this is Krippendorff's α (a chance-corrected coefficient), not Cohen's κ; the two differ by construction"
                }
              </div>
            </div>

            {/* Classification Metric Chips */}
            {report.binaryMetrics && (
              <div className="mt-5 space-y-2.5">
                <h4 className="text-xs font-semibold text-zinc-400">
                  Discrimination (Positive: &ldquo;{report.binaryMetrics.positiveClass}&rdquo;)
                </h4>
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="rounded-xl border border-surface-border bg-surface-subtle p-2.5 text-center">
                    <span className="block text-[11px] text-zinc-400 font-medium">Precision</span>
                    <strong className="text-xs sm:text-sm font-mono text-zinc-100">
                      {report.binaryMetrics.ppv !== null ? percent(report.binaryMetrics.ppv) : "—"}
                    </strong>
                  </div>
                  <div className="rounded-xl border border-surface-border bg-surface-subtle p-2.5 text-center">
                    <span className="block text-[11px] text-zinc-400 font-medium">Recall</span>
                    <strong className="text-xs sm:text-sm font-mono text-zinc-100">
                      {report.binaryMetrics.tpr !== null ? percent(report.binaryMetrics.tpr) : "—"}
                    </strong>
                  </div>
                  <div className="rounded-xl border border-surface-border bg-surface-subtle p-2.5 text-center">
                    <span className="block text-[11px] text-zinc-400 font-medium">F1 Score</span>
                    <strong className="text-xs sm:text-sm font-mono text-brand-lime">
                      {report.binaryMetrics.f1 !== null ? sigFigs(report.binaryMetrics.f1).slice(0, 4) : "—"}
                    </strong>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 pt-1 text-center font-mono text-[11px] text-zinc-400">
                  <div className="rounded-lg border border-surface-border bg-surface-subtle p-1.5">TP: <strong className="text-zinc-100">{report.binaryMetrics.tp}</strong></div>
                  <div className="rounded-lg border border-surface-border bg-surface-subtle p-1.5">FP: <strong className="text-zinc-100">{report.binaryMetrics.fp}</strong></div>
                  <div className="rounded-lg border border-surface-border bg-surface-subtle p-1.5">TN: <strong className="text-zinc-100">{report.binaryMetrics.tn}</strong></div>
                  <div className="rounded-lg border border-surface-border bg-surface-subtle p-1.5">FN: <strong className="text-zinc-100">{report.binaryMetrics.fn}</strong></div>
                </div>
              </div>
            )}
          </div>

          {/* CI Provenance */}
          {report.ci.accuracy && (
            <p className="text-[11px] font-mono text-zinc-500 pt-3 border-t border-surface-border" data-bootstrap-tier>
              {bootstrapTierCopy(report.n)} · seed {report.ci.accuracy.seed}
            </p>
          )}
        </div>
      </div>

      {/* Stage Bottom Navigation Bar */}
      <div className="flex items-center justify-between rounded-2xl border border-surface-border bg-surface-subtle px-6 py-4 shadow-sm">
        <Button
          type="button"
          variant="outline"
          onClick={() => setActiveStage("verdict")}
          className="h-10 gap-2 rounded-xl border border-surface-border bg-surface-base text-xs font-semibold text-zinc-200 transition-all hover:bg-surface-elevated hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Verdict</span>
        </Button>

        <Button
          type="button"
          onClick={() => setActiveStage("disagreements")}
          className="h-10 gap-2 rounded-xl bg-zinc-100 px-6 text-xs font-bold text-zinc-950 transition-all hover:bg-white hover:shadow active:scale-[0.98]"
        >
          <span>Proceed to Disagreements</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
