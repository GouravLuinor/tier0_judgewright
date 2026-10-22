"use client";

import { cn } from "@/lib/utils";
import {
  ALPHA_CEILING_NEEDS_RATERS,
  ALPHA_CI_PAIR_RESTRICTION,
  ALPHA_KAPPA_BANDS_NOTE,
  ALPHA_VS_KAPPA_DISCLOSURE,
} from "../../_lib/krippendorffAlpha";
import { letterGrade } from "../../_lib/grade";
import { coef, interval } from "../../_lib/display";
import { sigFigs } from "../../_lib/reportRender";
import type { CalibrationReport, JudgeScoreMode } from "../../_lib/types";
import { useToolStore } from "../../_store/useToolStore";

const SCORE_MODES: readonly { value: JudgeScoreMode; label: string; title: string }[] = [
  { value: "p-positive", label: "P(positive)", title: "The score is the probability that the reference label is the positive class." },
  { value: "confidence", label: "Confidence", title: "The score is the judge's confidence in its own label." },
];

/** A rate on screen; a zero denominator is a dash, never NaN. */
function rate(value: number | null): string {
  return value === null ? "—" : coef(value);
}

/**
 * The signals beyond κ, set as a printed specification sheet: one row per
 * signal, its name and what it answers on the left, the reading and its
 * disclosures on the right. A signal the input can't support says which
 * column it needs instead of showing a number.
 */
export function SignalsSection({ report }: { report: CalibrationReport }) {
  return (
    <dl className="divide-y divide-line border-y border-line">
      <Alpha report={report} />
      {(report.kappaLinear !== null || report.kappaQuadratic !== null) && <WeightedKappa report={report} />}
      <Calibration report={report} />
      <Bias report={report} />
      {report.binaryMetrics ? <BinaryMetrics report={report} /> : report.multiclass ? <PerLabel report={report} /> : null}
    </dl>
  );
}

function Row({
  name,
  question,
  children,
  ...data
}: {
  name: string;
  question: string;
  children: React.ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <div className="grid gap-3 py-6 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-10" {...data}>
      <dt>
        <span className="block text-base font-semibold [font-stretch:92%]">{name}</span>
        <span className="mt-1 block text-sm leading-relaxed text-ink-3">{question}</span>
      </dt>
      <dd className="min-w-0 text-sm leading-relaxed text-ink-2">{children}</dd>
    </div>
  );
}

function Reading({ label, value, exact, ...data }: { label: string; value: string; exact?: string } & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <div>
      <p className="text-xs text-ink-3">{label}</p>
      <p className="figures font-mono text-xl text-ink" data-value={exact} title={exact} {...data}>
        {value}
      </p>
    </div>
  );
}

function Alpha({ report }: { report: CalibrationReport }) {
  return (
    <Row
      name="Krippendorff’s α"
      question={`The judge as one member of the rating panel, at the “${report.alphaLevel}” level.`}
      data-alpha-panel={report.alphaLevel}
    >
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        <div>
          <Reading
            label="α, judge in the panel"
            value={report.alphaPanel === null ? "—" : coef(report.alphaPanel)}
            exact={report.alphaPanel === null ? undefined : sigFigs(report.alphaPanel)}
            data-alpha-panel-value
          />
          <p className="mt-0.5 text-xs text-ink-3">
            {report.alphaPanel === null
              ? (report.alphaUndefinedReason ?? "not computable on this input")
              : report.ci.alpha
                ? `interval ${interval(report.ci.alpha.low, report.ci.alpha.high)} · ${report.alphaReplicates?.toLocaleString("en-US") ?? "—"} seeded replicates`
                : "no interval: the time budget ran out (the point figure is unaffected)"}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-3">α, humans only</p>
          <p className="figures font-mono text-xl text-ink" data-alpha-humans-value>
            {report.alphaHumans === null ? "—" : coef(report.alphaHumans)}
          </p>
          <p className="mt-0.5 max-w-xs text-xs text-ink-3">
            {report.alphaHumans === null
              ? ALPHA_CEILING_NEEDS_RATERS
              : "The ceiling: how well your humans agree with each other. A judge can't meaningfully beat it."}
          </p>
        </div>
      </div>
      <p className="mt-4 max-w-prose">{ALPHA_VS_KAPPA_DISCLOSURE}</p>
      {report.alphaWarning !== null && <p className="mt-2 text-caution-ink">{report.alphaWarning}.</p>}
      {report.kappa !== null && report.alphaPanel !== null && (
        <p className="mt-2 max-w-[58ch] text-ink-3">
          Grade on α: {letterGrade(report.alphaPanel)}. {ALPHA_KAPPA_BANDS_NOTE}.
        </p>
      )}
      {report.ci.alpha !== null && (
        <p className="mt-2 max-w-[58ch] text-ink-3" data-alpha-ci-restriction>
          {ALPHA_CI_PAIR_RESTRICTION}.
        </p>
      )}
    </Row>
  );
}

function WeightedKappa({ report }: { report: CalibrationReport }) {
  return (
    <Row
      name="Weighted κ"
      question="For ordered labels, a near miss counts for more than a far one."
      data-weighted-kappa=""
    >
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        <Reading label="linear" value={rate(report.kappaLinear)} exact={report.kappaLinear === null ? undefined : sigFigs(report.kappaLinear)} />
        <Reading
          label="quadratic"
          value={rate(report.kappaQuadratic)}
          exact={report.kappaQuadratic === null ? undefined : sigFigs(report.kappaQuadratic)}
        />
      </div>
      <p className="mt-3 max-w-prose text-ink-3">
        Secondary readings over the sorted label ranks. The verdict, the grade,
        Δκ and every interval stay on unweighted κ.
      </p>
    </Row>
  );
}

function Calibration({ report }: { report: CalibrationReport }) {
  const judgeScoreMode = useToolStore((s) => s.settings.judgeScoreMode);
  const updateSettings = useToolStore((s) => s.updateSettings);
  const calibration = report.calibration;

  return (
    <Row name="Score calibration" question="When the judge gives a score, does a 0.8 come true about 80% of the time?">
      <div
        data-testid="ece-readout"
        data-ece={calibration?.ece ?? ""}
        data-brier={calibration?.brier ?? ""}
        data-score-mode={calibration?.scoreMode}
      >
        {calibration === null ? (
          <p>Not computable: needs at least two labels and a numeric judge_score column.</p>
        ) : calibration.computable ? (
          <>
            <div className="flex flex-wrap gap-x-10 gap-y-3">
              <Reading label="ECE (lower is better)" value={rate(calibration.ece)} exact={calibration.ece === null ? undefined : sigFigs(calibration.ece)} />
              <Reading label="Brier score" value={rate(calibration.brier)} exact={calibration.brier === null ? undefined : sigFigs(calibration.brier)} />
            </div>
            <p className="mt-2 text-xs text-ink-3">
              Point estimates without an interval · {calibration.mode === "width" ? "equal-width" : "equal-frequency"}{" "}
              bins, {calibration.bins} of them · positive class “{calibration.positiveClass}” ·{" "}
              {calibration.scoreCount.toLocaleString("en-US")} scored rows
            </p>
          </>
        ) : (
          <p>
            {calibration.reason ?? "Not computable: no numeric scores"}. Add a{" "}
            <code className="font-mono text-ink">judge_score</code> between zero and one to get ECE and Brier.
          </p>
        )}

        {calibration?.mismatchWarning && (
          <div role="status" data-testid="calibration-mismatch" className="mt-3 flex flex-wrap items-center gap-3 rounded-[3px] border border-caution/60 bg-caution/10 px-3 py-2 text-ink">
            <span>{calibration.mismatchWarning}</span>
            <button
              type="button"
              onClick={() => updateSettings({ judgeScoreMode: "confidence" })}
              className="h-8 rounded-[3px] border border-line bg-panel px-3 text-sm hover:border-line-strong"
            >
              Switch to confidence
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-3" id="score-mode-label">
            The score means
          </span>
          <div role="group" aria-labelledby="score-mode-label" data-testid="score-mode-control" className="inline-flex rounded-[3px] border border-line bg-panel p-0.5">
            {SCORE_MODES.map((mode) => {
              const active = judgeScoreMode === mode.value;
              return (
                <button
                  key={mode.value}
                  type="button"
                  title={mode.title}
                  aria-pressed={active}
                  data-active={active ? "true" : "false"}
                  onClick={() => updateSettings({ judgeScoreMode: mode.value })}
                  className={cn(
                    "h-7 rounded-[2px] px-2.5 font-mono text-xs transition-colors duration-150",
                    active ? "bg-select text-white dark:text-bezel" : "text-ink-2 hover:bg-sunk hover:text-ink"
                  )}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>
        </div>
        {report.labels.length >= 2 && (
          <label className="flex items-center gap-2 text-xs text-ink-3">
            Positive class
            <select
              data-testid="positive-class-select"
              value={report.positiveClass ?? report.labels[1] ?? ""}
              onChange={(event) => updateSettings({ positiveClass: event.target.value })}
              className="h-8 rounded-[3px] border border-line bg-panel px-2 font-mono text-xs text-ink hover:border-line-strong"
            >
              {report.labels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </Row>
  );
}

function Bias({ report }: { report: CalibrationReport }) {
  const bias = report.bias;
  return (
    <Row name="Position and length bias" question="In pairwise judging, does the judge favour the first slot or the longer answer?">
      <div data-testid="bias-readout" data-computable={bias.computable ? "true" : "false"}>
        {bias.computable ? (
          <>
            <div className="flex flex-wrap gap-x-10 gap-y-3">
              <Reading
                label={`first-slot preference − ½ (n = ${bias.positionN.toLocaleString("en-US")})`}
                value={rate(bias.positionBias)}
                exact={bias.positionBias === null ? undefined : sigFigs(bias.positionBias)}
              />
              <Reading
                label={`prefers longer − ½ (n = ${bias.verbosityN.toLocaleString("en-US")})`}
                value={rate(bias.verbosityBias)}
                exact={bias.verbosityBias === null ? undefined : sigFigs(bias.verbosityBias)}
              />
            </div>
            <p className="mt-2 text-xs text-ink-3">Zero is even-handed. Positive means the judge leans toward the first slot or the longer answer.</p>
          </>
        ) : (
          <p>
            {bias.note}
            {bias.missingColumns.length > 0 && <> Missing: {bias.missingColumns.join(", ")}.</>}
          </p>
        )}
      </div>
    </Row>
  );
}

function BinaryMetrics({ report }: { report: CalibrationReport }) {
  const m = report.binaryMetrics;
  if (!m) return null;
  const cells: [string, string][] = [
    ["true positives", m.tp.toLocaleString("en-US")],
    ["false positives", m.fp.toLocaleString("en-US")],
    ["true negatives", m.tn.toLocaleString("en-US")],
    ["false negatives", m.fn.toLocaleString("en-US")],
    ["recall (TPR)", rate(m.tpr)],
    ["specificity (TNR)", rate(m.tnr)],
    ["precision (PPV)", rate(m.ppv)],
    ["false positive rate", rate(m.fpr)],
    ["F1", rate(m.f1)],
  ];
  return (
    <Row name="Classification metrics" question={`Treating “${m.positiveClass}” as the positive class. Change it under Score calibration.`}>
      <table className="figures w-full max-w-xl text-sm">
        <tbody>
          {cells.map(([label, value]) => (
            <tr key={label} className="border-b border-line/70 last:border-b-0">
              <th scope="row" className="py-1.5 pr-4 text-left font-normal text-ink-2">
                {label}
              </th>
              <td className="py-1.5 text-right font-mono text-ink">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Row>
  );
}

function PerLabel({ report }: { report: CalibrationReport }) {
  const m = report.multiclass;
  if (!m) return null;
  return (
    <Row name="Per-label metrics" question="Which labels the judge gets right, one label at a time against the rest.">
      <div className="overflow-x-auto">
        <table className="figures w-full max-w-xl text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-3">
              {["label", "precision", "recall", "F1", "support"].map((head) => (
                <th key={head} scope="col" className={cn("py-1.5 font-normal", head === "label" ? "text-left" : "text-right")}>
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.perLabel.map((entry) => (
              <tr key={entry.label} className="border-b border-line/70 last:border-b-0">
                <th scope="row" className="py-1.5 text-left font-mono font-normal text-ink">
                  {entry.label}
                </th>
                <td className="py-1.5 text-right font-mono">{rate(entry.precision)}</td>
                <td className="py-1.5 text-right font-mono">{rate(entry.recall)}</td>
                <td className="py-1.5 text-right font-mono">{rate(entry.f1)}</td>
                <td className="py-1.5 text-right font-mono text-ink-3">{entry.support.toLocaleString("en-US")}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-ink-2">
              <th scope="row" className="py-1.5 text-left font-normal">
                macro average
              </th>
              <td className="py-1.5 text-right font-mono">{rate(m.macroPrecision)}</td>
              <td className="py-1.5 text-right font-mono">{rate(m.macroRecall)}</td>
              <td className="py-1.5 text-right font-mono">{rate(m.macroF1)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </Row>
  );
}
