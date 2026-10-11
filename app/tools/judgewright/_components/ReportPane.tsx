"use client";

import { useCallback, useMemo, useState } from "react";
import { Activity, Microscope, TriangleAlert } from "lucide-react";
import { copyTextToClipboard } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { MAX_TABLE_ROWS } from "../_lib/constants";
import { bootstrapTierCopy } from "../_lib/bootstrapCI";
import {
  ALPHA_CEILING_NEEDS_RATERS,
  ALPHA_KAPPA_BANDS_NOTE,
  ALPHA_VS_KAPPA_DISCLOSURE,
} from "../_lib/krippendorffAlpha";
import {
  GRADE_CONVENTION_COPY,
  GRADE_NEGATIVE_LABEL,
  NEGATIVE_KAPPA_COPY,
  letterGrade,
} from "../_lib/grade";
import {
  percent,
  renderMarkdownReport,
  sigFigs,
} from "../_lib/reportRender";
import { useToolStore } from "../_store/useToolStore";
import type { CalibrationReport } from "../_lib/types";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { ExportBar } from "./ExportBar";
import { BiasReadout, CalibrationReadout } from "./ReportInsights";

/**
 * The report pane: five states, one report card.
 *
 * READY renders the D2 calibration headline — raw agreement, accuracy, the
 * UNWEIGHTED κ with its seeded CI, the Δκ deflation, the letter grade (with its
 * Landis–Koch disclosed as a convention), the always-majority chance baseline,
 * the confusion-matrix heat table, the α panel (panel + human ceiling + the
 * mandatory κ-vs-α disclosure), the weighted κ secondary rows, the binary /
 * k-class metrics, the windowed disagreement table and the reproducibility
 * receipt (formula + inputs, so a reviewer can recompute κ). D3 adds the
 * ECE/Brier readout (with a score-mode mismatch hint), the position/verbosity
 * bias panel, the UNgated export bar and the gated opt-in LLM diagnosis - all
 * honest (not computable says so; the diagnosis never calls the network by default).
 */
export function ReportPane() {
  const stats = useToolStore((s) => s.stats);
  const parseIssues = useToolStore((s) => s.parseIssues);
  const parseIssueCount = useToolStore((s) => s.parseIssueCount);
  const errorMessage = useToolStore((s) => s.errorMessage);
  const isProcessing = useToolStore((s) => s.isProcessing);
  const degraded = useToolStore((s) => s.degraded);

  // The five states of BAR §2.5 — with one wrinkle from §3.22: the no-worker
  // path renders EXACTLY like success (data-report-state stays "ready") and
  // the amber banner is the only difference. A settle is never masked by
  // "processing": once stats exist they stay visible.
  const state = errorMessage
    ? "error"
    : stats
      ? "ready"
      : isProcessing
        ? "processing"
        : "idle";

  const handleCopyReport = useCallback(() => {
    if (!stats) return;
    void copyTextToClipboard(renderMarkdownReport(stats.report)).then(
      (succeeded) => {
        if (succeeded) {
          toast({
            title: "Report copied",
            description: "markdown report card",
          });
        } else {
          toast({ title: "Copy failed", variant: "destructive" });
        }
      }
    );
  }, [stats]);

  return (
    <section
      id="report-pane"
      aria-label="Calibration report"
      data-report-state={state}
      className="flex h-full min-h-0 flex-col rounded-xl border border-surface-border bg-surface-subtle/20"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-surface-border px-4 py-2.5">
        <h2 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
          calibration report
        </h2>
        {stats && (
          <>
            <span
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-brand-lime/40 bg-brand-lime/10 px-2 py-0.5 font-mono text-[10px] text-brand-lime"
              data-engine={stats.engine}
            >
              <Activity className="h-3 w-3" aria-hidden="true" />
              {stats.engine === "worker" ? "worker" : "main-thread"}
            </span>
            <span className="inline-flex items-center rounded-md border border-surface-border bg-surface-subtle px-2 py-0.5 font-mono text-[10px] text-zinc-400">
              {stats.parse.format}
            </span>
            <span className="inline-flex items-center rounded-md border border-surface-border bg-surface-subtle px-2 py-0.5 font-mono text-[10px] text-zinc-400">
              {stats.report.executionTimeMs}ms
            </span>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {degraded && (
          <p
            className="mb-3 flex items-start gap-2 rounded-lg border border-brand-amber/40 bg-brand-amber/10 p-3 text-xs leading-relaxed text-brand-amber"
            role="status"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Worker unavailable — computing on the main thread. Every number is
              identical; only the engine badge differs.
            </span>
          </p>
        )}

        {state === "idle" && (
          <div className="flex h-full min-h-0 flex-col items-center justify-center text-zinc-400">
            <Microscope className="mb-2 h-8 w-8 text-zinc-400" aria-hidden="true" />
            <p className="max-w-56 text-xs leading-relaxed">
              Paste your verdicts — the report settles as they land.
            </p>
          </div>
        )}

        {state === "processing" && (
          <div className="flex h-full min-h-0 flex-col items-center justify-center text-zinc-400">
            <Activity className="mb-2 h-8 w-8 animate-pulse text-brand-lime" aria-hidden="true" />
            <p className="text-xs">Computing calibration…</p>
          </div>
        )}

        {state === "error" && (
          <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 text-center">
            <TriangleAlert className="h-8 w-8 text-brand-rose" aria-hidden="true" />
            <p
              id="report-error-message"
              role="alert"
              className="max-w-80 text-xs leading-relaxed text-brand-rose"
            >
              {errorMessage}
            </p>
          </div>
        )}

        {stats && (
          <div className="space-y-4">
            <ParseIssues
              issues={parseIssues}
              issueCount={parseIssueCount}
              warnings={stats.parse.warnings}
            />
            <ReportCard stats={stats} onCopy={handleCopyReport} />
            <CountsRow stats={stats} />
          </div>
        )}
      </div>
    </section>
  );
}

/** The rows-skipped strip: honest about how many rows never reached the report. */
function ParseIssues({
  issues,
  issueCount,
  warnings,
}: {
  issues: ReturnType<typeof useToolStore.getState>["parseIssues"];
  issueCount: number;
  warnings: string[];
}) {
  if (issues.length === 0 && warnings.length === 0) return null;
  return (
    <div
      className="space-y-2 rounded-lg border border-brand-amber/40 bg-brand-amber/10 p-3"
      data-parse-issues
    >
      <p className="font-mono text-[10px] uppercase tracking-wider text-brand-amber">
        {issueCount > issues.length
          ? `${issues.length} of ${issueCount} rows skipped — report computed from the valid rows`
          : `${issueCount} rows skipped — report computed from the valid rows`}
      </p>
      <ul className="space-y-1">
        {issues.map((issue) => (
          <li
            key={`${issue.line}-${issue.cls}-${issue.reason}`}
            className="font-mono text-[11px] leading-relaxed text-zinc-300"
          >
            <span className="text-brand-amber">line {issue.line}</span> ·{" "}
            <span className="text-zinc-500">{issue.cls}</span> · {issue.reason}
          </li>
        ))}
      </ul>
      {warnings.map((warning) => (
        <p
          key={warning}
          className="font-mono text-[11px] leading-relaxed text-zinc-400"
        >
          {warning}
        </p>
      ))}
    </div>
  );
}

/** The report card itself — the headline, the matrix, the metrics, the receipt. */
function ReportCard({
  stats,
  onCopy,
}: {
  stats: NonNullable<ReturnType<typeof useToolStore.getState>["stats"]>;
  onCopy: () => void;
}) {
  const report = stats.report;
  const heat = useMemo(() => maxCell(report.confusion.matrix), [report]);

  return (
    <>
    <section
      aria-label="Calibration report card"
      className="space-y-4 rounded-xl border border-surface-border bg-surface-subtle/30 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-zinc-100">
            Calibration report card
          </h3>
          <p className="mt-1 font-mono text-[11px] text-zinc-400">
            n = {report.n.toLocaleString("en-US")} rows · labels{" "}
            {report.labels.join(" / ")} {report.binary ? "(binary)" : "(k-class)"}
            {report.positiveClass ? ` · positive ${report.positiveClass}` : ""}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onCopy}>
          Copy report
        </Button>
      </div>

      {/* ── Headline ─────────────────────────────────────────────────────── */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HeadlineStat
          label="raw agreement"
          value={percent(report.rawAgreement)}
          sub={report.ci.accuracy
            ? `${report.agreementRows.toLocaleString("en-US")} of ${report.n.toLocaleString("en-US")} rows agree exactly · 95% CI ${percent(report.ci.accuracy.low)}–${percent(report.ci.accuracy.high)}`
            : `${report.agreementRows.toLocaleString("en-US")} of ${report.n.toLocaleString("en-US")} rows agree exactly`}
          dataStat="agreement"
        />
        <HeadlineStat
          label="accuracy"
          value={percent(report.accuracy)}
          sub={
            report.ci.accuracy
              ? `the same exact-match figure under its metric name — one statistic, one interval: ${percent(report.ci.accuracy.low)}–${percent(report.ci.accuracy.high)}`
              : "the same exact-match figure under its metric name"
          }
          dataStat="accuracy"
        />
        {report.kappa === null ? (
          <div
            className="col-span-2 rounded-lg border border-brand-amber/40 bg-brand-amber/10 p-3"
            data-stat="kappa"
            data-kappa="undefined"
          >
            <dt className="font-mono text-[10px] uppercase tracking-wider text-brand-amber">
              unweighted κ
            </dt>
            <dd className="mt-1 text-xs leading-relaxed text-brand-amber">
              {report.kappaUndefinedReason ??
                "κ is undefined: no label variance to correct for."}
            </dd>
          </div>
        ) : (
          <HeadlineStat
            label="unweighted κ"
            value={sigFigs(report.kappa)}
            sub={
              report.kappa < 0
                ? NEGATIVE_KAPPA_COPY
                : report.ci.kappa
                  ? `chance-corrected — the headline figure, 95% CI ${sigFigs(report.ci.kappa.low)} to ${sigFigs(report.ci.kappa.high)}`
                  : "chance-corrected — the headline figure (no CI)"
            }
            accent
            dataStat="kappa"
            dataCi={report.ci.kappa ? "kappa" : undefined}
          />
        )}
        {report.kappa === null ? (
          <div
            className="rounded-lg border border-surface-border bg-surface-subtle/40 p-3"
            data-grade="undefined"
          >
            <dt className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
              letter grade
            </dt>
            <dd className="mt-1 font-mono text-lg font-semibold text-zinc-500">
              {report.grade}
            </dd>
            <dd className="mt-1 text-[10px] leading-relaxed text-zinc-500">
              no coefficient, no grade
            </dd>
          </div>
        ) : (
          <div
            className="rounded-lg border border-surface-border bg-surface-subtle/40 p-3"
            data-grade={report.grade}
            data-grade-label={report.gradeLabel}
          >
            <dt className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
              letter grade
            </dt>
            <dd className="mt-1 font-mono text-lg font-semibold text-brand-lime">
              {report.grade}
            </dd>
            <dd className="mt-1 text-[10px] leading-relaxed text-zinc-500">
              {report.gradeLabel === GRADE_NEGATIVE_LABEL
                ? GRADE_NEGATIVE_LABEL
                : report.gradeLabel}{" "}
              — {GRADE_CONVENTION_COPY}
            </dd>
          </div>
        )}
        <HeadlineStat
          label="chance baseline"
          value={percent(report.baseline.baselineAgreement)}
          sub={`always-majority on this label distribution = ${percent(report.baseline.baselineAgreement)} (majority "${report.baseline.majorityClass}")`}
          dataStat="baseline"
        />
      </dl>

      {/* ── Deflation ────────────────────────────────────────────────────── */}
      {report.kappa !== null &&
        report.deflation !== null &&
        report.liftOverBaseline !== null && (
        <p
          className="rounded-lg border border-surface-border bg-surface-subtle/40 p-3 text-xs leading-relaxed text-zinc-300"
          data-deflation
        >
          {report.kappa < 0 ? (
            <>
              <span className="font-mono text-brand-rose">
                Δκ = {sigFigs(report.deflation)}
              </span>{" "}
              — raw agreement {percent(report.rawAgreement)} and κ{" "}
              <span className="font-mono">{sigFigs(report.kappa)}</span> are
              printed together; κ is negative, so the pp figures below do not
              describe a flattering judge.{" "}
              <span className="text-brand-rose">{NEGATIVE_KAPPA_COPY}.</span>
            </>
          ) : (
            <>
              <span className="font-mono text-brand-lime">
                Δκ = {sigFigs(report.deflation)}
              </span>{" "}
              — raw agreement {percent(report.rawAgreement)} overstates the
              chance-corrected κ by {(report.deflation * 100).toFixed(1)} pp, and
              the judge sits{" "}
              <span className="font-mono">
                {(report.liftOverBaseline * 100).toFixed(1)} pp
              </span>{" "}
              above the always-majority baseline.
            </>
          )}
        </p>
      )}

      {/* ── Confusion matrix heat table ──────────────────────────────────── */}
      <div>
        <h4 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
          confusion matrix — rows = human, cols = judge (sorted{" "}
          {report.labels.join(" < ")})
        </h4>
        <table className="mt-2 w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-surface-border px-2 py-1 text-left font-mono text-[10px] text-zinc-400">
                human \ judge
              </th>
              {report.labels.map((label) => (
                <th
                  key={label}
                  className="border border-surface-border px-2 py-1 text-left font-mono text-[10px] text-zinc-400"
                >
                  {label}
                </th>
              ))}
              <th className="border border-surface-border px-2 py-1 text-left font-mono text-[10px] text-zinc-400">
                total
              </th>
            </tr>
          </thead>
          <tbody>
            {report.confusion.matrix.map((row, h) => (
              <tr key={report.labels[h] ?? String(h)}>
                <th className="border border-surface-border px-2 py-1 text-left font-mono text-[10px] text-zinc-400">
                  {report.labels[h]}
                </th>
                {row.map((cell, j) => (
                  <td
                    key={report.labels[j] ?? String(j)}
                    className={`border border-surface-border px-2 py-1 font-mono tabular-nums ${heatTone(
                      cell,
                      h === j,
                      heat
                    )}`}
                  >
                    {cell}
                  </td>
                ))}
                <td className="border border-surface-border px-2 py-1 font-mono tabular-nums text-zinc-400">
                  {report.confusion.rowTotals[h]?.toLocaleString("en-US")}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="border border-surface-border px-2 py-1 text-left font-mono text-[10px] text-zinc-400">
                total
              </th>
              {report.confusion.colTotals.map((total, j) => (
                <td
                  key={report.labels[j] ?? String(j)}
                  className="border border-surface-border px-2 py-1 font-mono tabular-nums text-zinc-400"
                >
                  {total.toLocaleString("en-US")}
                </td>
              ))}
              <td className="border border-surface-border px-2 py-1 font-mono tabular-nums text-zinc-400">
                {report.n.toLocaleString("en-US")}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Krippendorff's α panel ────────────────────────────────────────── */}
      <section
        aria-label="Krippendorff alpha panel"
        data-alpha-panel={report.alphaLevel}
        className="space-y-2 rounded-lg border border-surface-border bg-surface-subtle/30 p-3"
      >
        <h4 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
          krippendorff&rsquo;s α — level &quot;{report.alphaLevel}&quot;, judge
          as a panel member
        </h4>
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
              α (panel)
            </dt>
            <dd
              className="mt-0.5 font-mono text-base font-semibold text-zinc-100"
              data-alpha-panel-value
            >
              {report.alphaPanel === null ? "—" : sigFigs(report.alphaPanel)}
            </dd>
            <dd className="mt-0.5 text-[10px] leading-relaxed text-zinc-500">
              {report.alphaPanel === null
                ? (report.alphaUndefinedReason ?? "not computable on this input")
                : report.ci.alpha
                  ? `95% CI ${sigFigs(report.ci.alpha.low)} to ${sigFigs(report.ci.alpha.high)} · ${report.alphaReplicates?.toLocaleString("en-US") ?? "—"} replicates, seeded`
                  : "no CI — the budget was reached (point statistic unaffected)"}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
              α (human ceiling)
            </dt>
            <dd
              className="mt-0.5 font-mono text-base font-semibold text-zinc-100"
              data-alpha-humans-value
            >
              {report.alphaHumans === null ? "—" : sigFigs(report.alphaHumans)}
            </dd>
            <dd className="mt-0.5 text-[10px] leading-relaxed text-zinc-500">
              {report.alphaHumans === null ? ALPHA_CEILING_NEEDS_RATERS : "humans only, judge excluded — the ceiling a single judge cannot be compared past"}
            </dd>
          </div>
        </dl>
        <p className="text-[11px] leading-relaxed text-zinc-400">
          {ALPHA_VS_KAPPA_DISCLOSURE}
          {report.alphaWarning !== null && (
            <>
              <br />
              <span className="text-brand-amber">{report.alphaWarning}.</span>
            </>
          )}
          {report.kappa !== null && (
            <>
              <br />
              <span className="text-zinc-500">
                grade on α: {report.alphaPanel === null ? "—" : letterGrade(report.alphaPanel)}{" "}
                — {ALPHA_KAPPA_BANDS_NOTE}.
              </span>
            </>
          )}
        </p>
      </section>

      {/* ── Weighted κ: labelled secondary rows ───────────────────────────── */}
      {(report.kappaLinear !== null || report.kappaQuadratic !== null) && (
        <div
          className="rounded-lg border border-surface-border bg-surface-subtle/30 p-3"
          data-weighted-kappa
        >
          <h4 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
            weighted κ — secondary rows (1 − D_o/D_e over sorted label ranks)
          </h4>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <dt className="font-mono text-[10px] uppercase text-zinc-500">
                linear
              </dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold text-zinc-100">
                {report.kappaLinear === null ? "—" : sigFigs(report.kappaLinear)}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase text-zinc-500">
                quadratic
              </dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold text-zinc-100">
                {report.kappaQuadratic === null ? "—" : sigFigs(report.kappaQuadratic)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
            secondary rows only — the headline, the grade, the Δκ deflation and
            every CI stay on the UNWEIGHTED κ.
          </p>
        </div>
      )}

      {/* ── CI provenance: the tier copy, verbatim ─────────────────────────── */}
      {report.ci.accuracy !== null && (
        <p
          className="rounded-lg border border-surface-border bg-surface-subtle/30 p-3 font-mono text-[10px] leading-relaxed text-zinc-400"
          data-bootstrap-tier
        >
          {bootstrapTierCopy(report.n)} · seed {report.ci.accuracy.seed} ·
          percentile CIs, index-resampled — byte-identical for the same seed.
        </p>
      )}
      {report.ciDropped && (
        <p
          className="rounded-lg border border-brand-amber/40 bg-brand-amber/10 p-3 text-xs leading-relaxed text-brand-amber"
          data-ci-dropped
          role="status"
        >
          Bootstrap CIs omitted — the cooperative deadline was reached. Point
          statistics, the chance baseline and B are unchanged; re-run for the
          intervals.
        </p>
      )}

      {/* ── Disagreement table (windowed) ─────────────────────────────────── */}
      <DisagreementTable report={report} />

      {/* ── Metrics ──────────────────────────────────────────────────────── */}
      {report.binaryMetrics && (
        <div>
          <h4 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
            binary metrics — positive class &quot;
            {report.binaryMetrics.positiveClass}&quot;
          </h4>
          <dl className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            <MiniStat label="TP" value={String(report.binaryMetrics.tp)} />
            <MiniStat label="FP" value={String(report.binaryMetrics.fp)} />
            <MiniStat label="TN" value={String(report.binaryMetrics.tn)} />
            <MiniStat label="FN" value={String(report.binaryMetrics.fn)} />
            <MiniStat label="TPR" value={rate(report.binaryMetrics.tpr)} />
            <MiniStat label="TNR" value={rate(report.binaryMetrics.tnr)} />
            <MiniStat label="PPV" value={rate(report.binaryMetrics.ppv)} />
            <MiniStat label="FPR" value={rate(report.binaryMetrics.fpr)} />
            <MiniStat label="F1" value={rate(report.binaryMetrics.f1)} />
          </dl>
        </div>
      )}

      {report.multiclass && (
        <div>
          <h4 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
            per-label metrics
          </h4>
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr>
                {["label", "precision", "recall", "F1", "support"].map((head) => (
                  <th
                    key={head}
                    className="border border-surface-border px-2 py-1 text-left font-mono text-[10px] text-zinc-400"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.multiclass.perLabel.map((entry) => (
                <tr key={entry.label}>
                  <td className="border border-surface-border px-2 py-1 font-mono">
                    {entry.label}
                  </td>
                  <td className="border border-surface-border px-2 py-1 font-mono tabular-nums">
                    {rate(entry.precision)}
                  </td>
                  <td className="border border-surface-border px-2 py-1 font-mono tabular-nums">
                    {rate(entry.recall)}
                  </td>
                  <td className="border border-surface-border px-2 py-1 font-mono tabular-nums">
                    {rate(entry.f1)}
                  </td>
                  <td className="border border-surface-border px-2 py-1 font-mono tabular-nums text-zinc-400">
                    {entry.support}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Receipt ──────────────────────────────────────────────────────── */}
      <div>
        <h4 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
          reproducibility receipt — recompute κ from these inputs
        </h4>
        <pre
          className="mt-2 overflow-x-auto rounded-lg border border-surface-border bg-surface-base p-3 font-mono text-[11px] leading-relaxed text-zinc-300"
          data-receipt
        >
          {report.receipt}
        </pre>
      </div>

    </section>

    {/* D3: ECE/Brier, the bias panel, exports and the optional diagnosis */}
    <section aria-label="Calibration insights" className="space-y-3">
      <CalibrationReadout report={report} />
      <BiasReadout report={report} />
      <ExportBar stats={stats} />
      <DiagnosisPanel />
    </section>
    </>
  );
}

/** The honest paste counts: they describe the WHOLE paste, not the valid rows. */
function CountsRow({
  stats,
}: {
  stats: NonNullable<ReturnType<typeof useToolStore.getState>["stats"]>;
}) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="characters" value={stats.characterCount} />
      <Stat label="words" value={stats.wordCount} />
      <Stat label="bytes" value={stats.byteCount} />
      <Stat label="lines" value={stats.lineCount} />
    </dl>
  );
}

function HeadlineStat({
  label,
  value,
  sub,
  accent = false,
  dataStat,
  dataCi,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  dataStat: string;
  /** Marks the statistic whose interval is on screen (e2e reads it). */
  dataCi?: string;
}) {
  return (
    <div
      className="rounded-lg border border-surface-border bg-surface-subtle/40 p-3"
      data-stat={dataStat}
      data-ci={dataCi}
    >
      <dt className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </dt>
      <dd
        className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
          accent ? "text-brand-lime" : "text-zinc-100"
        }`}
      >
        {value}
      </dd>
      <dd className="mt-1 text-[10px] leading-relaxed text-zinc-500">{sub}</dd>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-subtle/40 p-2">
      <dt className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-zinc-100">
        {value}
      </dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="rounded-lg border border-surface-border bg-surface-subtle/40 p-3"
      data-stat={label}
    >
      <dt className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-lg font-semibold text-zinc-100 tabular-nums">
        {value.toLocaleString("en-US")}
      </dd>
    </div>
  );
}

/** A rate with a zero denominator prints "—", never NaN. */
function rate(value: number | null): string {
  return value === null ? "—" : sigFigs(value);
}

/** Largest cell in the matrix, for the heat tiers. */
function maxCell(matrix: number[][]): number {
  let max = 0;
  for (const row of matrix) {
    for (const cell of row) {
      if (cell > max) max = cell;
    }
  }
  return max;
}

/**
 * Heat tone: agreement cells wear the accent, disagreement the rose state.
 * Literal class strings only — Tailwind needs the full name at build time.
 */
function heatTone(cell: number, isDiagonal: boolean, max: number): string {
  if (cell === 0 || max === 0) return "text-zinc-500";
  const share = cell / max;
  const tier = share > 0.5 ? 3 : share > 0.2 ? 2 : 1;
  if (isDiagonal) {
    return tier === 3
      ? "bg-brand-lime/40 text-zinc-100"
      : tier === 2
        ? "bg-brand-lime/20 text-zinc-100"
        : "bg-brand-lime/10 text-zinc-100";
  }
  return tier === 3
    ? "bg-brand-rose/40 text-zinc-100"
    : tier === 2
      ? "bg-brand-rose/20 text-zinc-100"
      : "bg-brand-rose/10 text-zinc-100";
}

/**
 * The windowed disagreement table. The worker posts at most MAX_TABLE_ROWS
 * rows, and the strip under the header names the truth ("showing X of Y")
 * instead of implying it rendered everything (AC-16). A "disagreements only"
 * filter keeps the noise down without hiding what the judge got wrong, and 5,000
 * rows stay a layout win because the window never exceeds the copy cap.
 */
function DisagreementTable({ report }: { report: CalibrationReport }) {
  const window = useToolStore((s) => s.disagreementWindow);
  const rows = window?.rows ?? report.disagreements;
  const totalRows = window?.totalCount ?? report.n;
  const [disagreementsOnly, setDisagreementsOnly] = useState(false);

  const visible = disagreementsOnly ? rows.filter((row) => !row.agree) : rows;
  const disagreementsHidden = rows.filter((row) => !row.agree).length;

  return (
    <section
      aria-label="Disagreement table"
      className="rounded-lg border border-surface-border bg-surface-subtle/30 p-3"
      data-disagreement-table
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
          per-example rows — disagreements flagged
        </h4>
        <label className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-zinc-400">
          <input
            type="checkbox"
            className="h-3 w-3 accent-brand-lime"
            checked={disagreementsOnly}
            onChange={(event) => setDisagreementsOnly(event.target.checked)}
          />
          disagreements only
        </label>
      </div>
      <p
        className="mt-1 font-mono text-[10px] text-zinc-500"
        data-disagreement-strip
      >
        {disagreementsOnly
          ? `${visible.length.toLocaleString("en-US")} of ${disagreementsHidden.toLocaleString("en-US")} shown disagreements in this window`
          : `showing ${visible.length.toLocaleString("en-US")} of ${totalRows.toLocaleString("en-US")} rows — the table caps at ${MAX_TABLE_ROWS.toLocaleString("en-US")}; the full set is pulled on demand for export and diagnosis`}
      </p>
      <div className="mt-2 max-h-72 overflow-y-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {["line", "example_id", "human", "judge", "verdict"].map((head) => (
                <th
                  key={head}
                  className="border border-surface-border px-2 py-1 text-left font-mono text-[10px] text-zinc-400"
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={`${row.lineNumber}-${row.exampleId}`}
                data-agree={row.agree ? "true" : "false"}
                className={row.agree ? "text-zinc-300" : "text-brand-amber"}
              >
                <td className="border border-surface-border px-2 py-1 font-mono tabular-nums text-zinc-500">
                  {row.lineNumber}
                </td>
                <td className="border border-surface-border px-2 py-1 font-mono">
                  {row.exampleId}
                </td>
                <td className="border border-surface-border px-2 py-1 font-mono">
                  {row.humanLabels.length > 1
                    ? `${row.humanLabel} (+${row.humanLabels.length - 1})`
                    : row.humanLabel}
                </td>
                <td className="border border-surface-border px-2 py-1 font-mono">
                  {row.judgeLabel}
                </td>
                <td className="border border-surface-border px-2 py-1 font-mono">
                  {row.agree ? "agree" : "DISAGREE"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}


