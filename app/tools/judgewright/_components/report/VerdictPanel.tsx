"use client";

import { ArrowDown, Copy, TriangleAlert } from "lucide-react";
import { Keycap } from "@/components/ui/keycap";
import { cn } from "@/lib/utils";
import { GRADE_CONVENTION_COPY, GRADE_NEGATIVE_LABEL } from "../../_lib/grade";
import { coef, interval, pct, pp, readVerdict, type VerdictTone } from "../../_lib/display";
import { degradedNoticeCopy, sigFigs } from "../../_lib/reportRender";
import type { CalibrationReport, ParseIssue, VerdictAnalysis } from "../../_lib/types";
import { useToolStore } from "../../_store/useToolStore";
import { AgreementScale } from "./AgreementScale";
import { PopulationStrip } from "./PopulationStrip";
import { copyOneLineVerdict } from "./exportActions";

const TONE_PATCH: Record<VerdictTone, string> = {
  trust: "bg-agree",
  caution: "bg-caution",
  distrust: "bg-miss",
  undefined: "bg-wedge-3",
};

/**
 * The answer. Inside the bezel: one sentence on whether the judge can be
 * trusted, the agreement scale that shows why, the three figures behind it
 * and the next step. Everything deeper lives further down the page.
 */
export function VerdictPanel() {
  const stats = useToolStore((s) => s.stats);
  const errorMessage = useToolStore((s) => s.errorMessage);
  const isProcessing = useToolStore((s) => s.isProcessing);
  const degraded = useToolStore((s) => s.degraded);
  const parseIssues = useToolStore((s) => s.parseIssues);
  const parseIssueCount = useToolStore((s) => s.parseIssueCount);
  const isWorkerAvailable = useToolStore((s) => s.isWorkerAvailable);

  // A settle is never masked by "processing": once stats exist they stay.
  const state = errorMessage ? "error" : stats ? "ready" : isProcessing ? "processing" : "idle";

  return (
    <section
      id="report-pane"
      aria-label="Calibration report"
      data-report-state={state}
      className="flex min-w-0 flex-col rounded-[4px] bg-bezel p-1.5 text-ink shadow-lift sm:p-2"
    >
      <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 px-2 pb-1.5 pt-0.5 font-mono text-xs text-bezel-muted">
        {stats ? (
          <>
            <span className="figures text-bezel-ink">n = {stats.report.n.toLocaleString("en-US")} rows</span>
            <span>{stats.parse.format}</span>
            <span>
              engine{" "}
              <span data-engine={stats.engine} className="text-bezel-ink">
                {stats.engine === "worker" ? "worker" : "main-thread"}
              </span>
            </span>
            <span className="figures hidden sm:inline">{stats.report.executionTimeMs} ms</span>
            <button
              type="button"
              onClick={() => void copyOneLineVerdict(stats.report)}
              className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-[3px] px-2 font-sans text-sm text-bezel-ink transition-colors duration-150 hover:bg-bezel-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Copy verdict
              <Keycap size="xs" className="hidden border-bezel-line bg-bezel-raised text-bezel-muted shadow-none sm:inline-flex">
                ⌘⇧C
              </Keycap>
            </button>
          </>
        ) : (
          <span>calibration report</span>
        )}
      </div>

      <div className="flex min-h-[22rem] flex-1 flex-col rounded-[2px] bg-panel p-4 sm:p-6">
        {(degraded || isWorkerAvailable === false) && (
          <p
            id="worker-degraded-banner"
            role="status"
            data-degraded-notice
            className="mb-4 flex items-start gap-2 rounded-[3px] border border-caution/60 bg-caution/10 p-3 text-sm leading-relaxed text-ink"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-caution-ink" aria-hidden="true" />
            {degradedNoticeCopy(stats === null ? null : stats.report.ciDropped)}
          </p>
        )}

        {state === "idle" && (
          <Waiting>Paste verdicts or load a sample, and the report appears here.</Waiting>
        )}
        {state === "processing" && (
          <Waiting busy>
            {isWorkerAvailable === null ? "Starting the calculator in this tab…" : "Calibrating…"}
          </Waiting>
        )}
        {state === "error" && (
          <div className="flex flex-1 flex-col justify-center gap-4">
            <div className="flex items-start gap-3">
              <span className="patch mt-1.5 h-3 w-3 shrink-0 bg-miss" aria-hidden="true" />
              <p id="report-error-message" role="alert" className="max-w-prose text-lg leading-snug text-ink">
                {errorMessage}
              </p>
            </div>
            <ParseIssues issues={parseIssues} count={parseIssueCount} />
          </div>
        )}
        {stats && state === "ready" && <Report stats={stats} />}
      </div>
    </section>
  );
}

function Waiting({ children, busy = false }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-4">
      <div className="flex h-9 w-full max-w-md gap-[2px]" aria-hidden="true">
        {["bg-wedge-0", "bg-wedge-1", "bg-wedge-2", "bg-wedge-3", "bg-wedge-4", "bg-wedge-5"].map((fill, i) => (
          <span
            key={fill}
            className={cn("patch flex-1", fill, busy && "animate-pulse motion-reduce:animate-none")}
            style={busy ? { animationDelay: `${i * 90}ms` } : undefined}
          />
        ))}
      </div>
      <p className="text-base text-ink-2">{children}</p>
    </div>
  );
}

function Report({ stats }: { stats: VerdictAnalysis }) {
  const report = stats.report;
  const confidence = useToolStore((s) => s.settings.confidenceLevel);
  const window = useToolStore((s) => s.disagreementWindow);
  const parseIssues = useToolStore((s) => s.parseIssues);
  const parseIssueCount = useToolStore((s) => s.parseIssueCount);
  const verdict = readVerdict(report);
  const ciLabel = `${Math.round(confidence * 100)}% CI`;

  return (
    <div role="region" aria-label="Calibration report card" className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className={cn("patch mt-2 h-3.5 w-3.5 shrink-0", TONE_PATCH[verdict.tone])} aria-hidden="true" />
        <div>
          <p className="text-xl font-semibold leading-snug tracking-[-0.01em] [font-stretch:92%] sm:text-2xl">
            {verdict.headline}
          </p>
          <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-ink-2">{verdict.detail}</p>
        </div>
      </div>

      <AgreementScale report={report} />

      <dl className="grid grid-cols-1 border-y border-line sm:grid-cols-3 sm:divide-x sm:divide-line">
        <Figure
          stat="agreement"
          label="raw agreement"
          value={pct(report.rawAgreement)}
          exact={sigFigs(report.rawAgreement)}
          sub={
            report.ci.accuracy
              ? `share of rows where the labels match (accuracy); ${ciLabel} ${pct(report.ci.accuracy.low)} to ${pct(report.ci.accuracy.high)}`
              : "share of rows where the labels match (accuracy)"
          }
        />
        {report.kappa === null ? (
          <div data-stat="kappa" data-kappa="undefined" className="px-0 py-3 sm:px-4">
            <dt className="text-sm text-ink-2">unweighted κ</dt>
            <dd className="mt-1 text-sm leading-relaxed text-caution-ink">
              {report.kappaUndefinedReason ?? "κ is undefined: no label variance to correct for."}
            </dd>
          </div>
        ) : (
          <Figure
            stat="kappa"
            ci={report.ci.kappa ? "kappa" : undefined}
            label="unweighted κ"
            value={coef(report.kappa)}
            exact={sigFigs(report.kappa)}
            sub={
              report.ci.kappa
                ? `chance-corrected agreement; ${ciLabel} ${interval(report.ci.kappa.low, report.ci.kappa.high)}`
                : "chance-corrected agreement; no interval for this run"
            }
            accent
          />
        )}
        <Figure
          stat="baseline"
          label="chance baseline"
          value={pct(report.baseline.baselineAgreement)}
          exact={sigFigs(report.baseline.baselineAgreement)}
          sub={`always-majority on this label distribution = ${pct(report.baseline.baselineAgreement)} (always “${report.baseline.majorityClass}”)`}
        />
      </dl>

      <div className="flex flex-col gap-2 text-sm leading-relaxed text-ink-2">
        {report.kappa === null ? (
          <p data-grade="undefined">No coefficient, so no grade.</p>
        ) : (
          <p data-grade={report.grade} data-grade-label={report.gradeLabel}>
            <span className="font-medium text-ink">
              Grade {report.grade},{" "}
              {report.gradeLabel === GRADE_NEGATIVE_LABEL ? GRADE_NEGATIVE_LABEL : report.gradeLabel}.
            </span>{" "}
            {GRADE_CONVENTION_COPY}.
          </p>
        )}
        {report.kappa !== null && report.deflation !== null && (
          <p data-deflation data-value={sigFigs(report.deflation)}>
            <span className="figures font-mono text-ink">Δκ = {coef(report.deflation)}</span>
            {report.kappa < 0
              ? `: κ is negative, so the judge disagrees with your humans systematically; raw agreement ${pct(report.rawAgreement)} hides that.`
              : `: raw agreement overstates κ by ${pp(report.deflation)}${
                  report.liftOverBaseline === null
                    ? "."
                    : Math.abs(report.liftOverBaseline) < 0.0005
                      ? `, and the judge does no better than always answering “${report.baseline.majorityClass}”.`
                      : report.liftOverBaseline > 0
                        ? `, and the judge sits ${pp(report.liftOverBaseline)} above always-majority.`
                        : `, and the judge sits ${pp(-report.liftOverBaseline)} below always-majority.`
                }`}
          </p>
        )}
        {report.ciDropped && (
          <p data-ci-dropped role="status" className="text-caution-ink">
            Bootstrap CIs omitted: the time budget ran out. The point statistics,
            the chance baseline and B are unchanged; run it again for the intervals.
          </p>
        )}
      </div>

      <PopulationStrip rows={window?.rows ?? report.disagreements} total={window?.totalCount ?? report.n} />

      <ParseIssues issues={parseIssues} count={parseIssueCount} warnings={stats.parse.warnings} />

      <NextStep report={report} />
    </div>
  );
}

function Figure({
  stat,
  ci,
  label,
  value,
  exact,
  sub,
  accent = false,
}: {
  stat: string;
  ci?: string;
  label: string;
  value: string;
  /** The 17-significant-digit value the exports print, for reviewers and tests. */
  exact: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      data-stat={stat}
      data-ci={ci}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-line/70 py-3 last:border-b-0 sm:block sm:border-b-0 sm:px-4 sm:first:pl-0"
    >
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd
        data-value={exact}
        title={exact}
        className={cn("figures font-mono text-xl sm:mt-0.5 sm:text-2xl", accent ? "text-select-ink" : "text-ink")}
      >
        {value}
      </dd>
      <dd className="col-span-2 mt-1 text-xs leading-relaxed text-ink-3">{sub}</dd>
    </div>
  );
}

function NextStep({ report }: { report: CalibrationReport }) {
  const misses = report.disagreementTotal;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-5">
      {misses > 0 ? (
        <a
          href="#failures"
          className="inline-flex h-10 items-center gap-2 rounded-[3px] bg-select px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-select/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select focus-visible:ring-offset-2 focus-visible:ring-offset-panel dark:text-bezel"
        >
          Read the {misses.toLocaleString("en-US")} {misses === 1 ? "disagreement" : "disagreements"}
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        </a>
      ) : (
        <p className="text-sm text-ink-2">The judge matched every human label in this set.</p>
      )}
      <a href="#signals" className="text-sm text-ink-2 underline decoration-line-strong hover:text-ink">
        Beyond κ: α, calibration, bias
      </a>
      <a href="#share" className="text-sm text-ink-2 underline decoration-line-strong hover:text-ink">
        Export and receipt
      </a>
    </div>
  );
}

function ParseIssues({
  issues,
  count,
  warnings = [],
}: {
  issues: ParseIssue[];
  count: number;
  warnings?: string[];
}) {
  if (issues.length === 0 && warnings.length === 0) return null;
  return (
    <div data-parse-issues className="rounded-[3px] border border-caution/60 bg-caution/10 p-3 text-sm">
      {count > 0 && (
        <p className="font-medium text-ink">
          {count > issues.length
            ? `${count.toLocaleString("en-US")} rows skipped (first ${issues.length} listed); the report uses the valid rows.`
            : `${count.toLocaleString("en-US")} ${count === 1 ? "row" : "rows"} skipped; the report uses the valid rows.`}
        </p>
      )}
      <ul className="mt-1.5 space-y-1">
        {issues.map((issue) => (
          <li key={`${issue.line}-${issue.cls}-${issue.reason}`} className="font-mono text-xs leading-relaxed text-ink-2">
            <span className="text-caution-ink">line {issue.line}</span> · {issue.cls} · {issue.reason}
          </li>
        ))}
      </ul>
      {warnings.map((warning) => (
        <p key={warning} className="mt-1.5 text-xs leading-relaxed text-ink-2">
          {warning}
        </p>
      ))}
    </div>
  );
}
