import { cn } from "@/lib/utils";
import { coef, pct, scalePosition, wedgeSteps } from "../../_lib/display";
import type { CalibrationReport } from "../../_lib/types";

const STEPS = wedgeSteps();
// Darkest patch is "worse than chance"; the wedge lightens as agreement rises.
const STEP_FILL = ["bg-wedge-0", "bg-wedge-1", "bg-wedge-2", "bg-wedge-3", "bg-wedge-4", "bg-wedge-5"];
const STEP_INK = ["text-bezel-ink", "text-bezel-ink", "text-white", "text-ink", "text-ink", "text-ink"];

/** Keeps an edge label inside the scale instead of centring it off the end. */
function anchor(position: number): string {
  if (position < 8) return "translate-x-0";
  if (position > 92) return "-translate-x-full";
  return "-translate-x-1/2";
}

/**
 * The shared agreement scale: one −1…1 axis printed as a six-step grey wedge
 * (worse than chance, then the Landis–Koch bands). κ, its interval, the chance
 * line and raw agreement all sit on the same axis, so the gap between raw
 * agreement and κ is a distance you can see, not a number you have to trust.
 */
export function AgreementScale({ report }: { report: CalibrationReport }) {
  const kappa = report.kappa;
  const ci = report.ci.kappa;
  const kappaPos = kappa === null ? null : scalePosition(kappa);
  const rawPos = scalePosition(report.rawAgreement);
  const chancePos = scalePosition(0);
  const activeStep =
    kappa === null ? -1 : STEPS.findIndex((step, i) => kappa >= step.from && (kappa < step.to || i === STEPS.length - 1));

  return (
    <figure className="w-full" aria-label="Agreement scale from minus one to one">
      {/* κ label rides above its marker */}
      <div className="relative h-7">
        {kappaPos !== null && kappa !== null && (
          <span
            className={cn(
              "figures absolute bottom-1 whitespace-nowrap font-mono text-sm font-medium text-select-ink",
              anchor(kappaPos)
            )}
            style={{ left: `${kappaPos}%` }}
          >
            κ {coef(kappa)}
            <span className="font-sans text-ink-3 sm:hidden"> · {STEPS[activeStep]?.label}</span>
          </span>
        )}
      </div>

      <div className="relative">
        <div className="flex h-9 w-full gap-[2px]" aria-hidden="true">
          {STEPS.map((step, i) => (
            <div
              key={step.label}
              className={cn(
                "patch relative flex items-center justify-center overflow-hidden",
                STEP_FILL[i],
                i === activeStep && "outline outline-2 outline-offset-1 outline-select"
              )}
              style={{ width: `${((step.to - step.from) / 2) * 100}%` }}
            >
              <span className={cn("hidden px-1 text-center text-[11px] leading-tight md:block", STEP_INK[i])}>
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* The interval: a bracket under the wedge from low to high */}
        {ci && (
          <div
            className="absolute -bottom-2 h-1.5 border-x-2 border-b-2 border-select"
            style={{
              left: `${scalePosition(ci.low)}%`,
              width: `${Math.max(scalePosition(ci.high) - scalePosition(ci.low), 0.5)}%`,
            }}
            aria-hidden="true"
          />
        )}

        {/* Chance line at κ = 0 */}
        <div
          className="absolute -bottom-3 -top-1 w-px border-l border-dashed border-ink-2"
          style={{ left: `${chancePos}%` }}
          aria-hidden="true"
        />

        {/* Raw agreement, on the same axis */}
        <div
          className="absolute -bottom-3 -top-1 w-[2px] bg-ink-2"
          style={{ left: `calc(${rawPos}% - 1px)` }}
          aria-hidden="true"
        />

        {kappaPos !== null && (
          <div
            className="marker-settle absolute -bottom-3 -top-2 w-[4px] rounded-[1px] bg-select shadow-[0_0_0_2px_rgb(var(--panel))]"
            style={{ left: `calc(${kappaPos}% - 2px)` }}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="relative mt-4 h-5 text-xs text-ink-2">
        <span className={cn("absolute whitespace-nowrap", anchor(chancePos))} style={{ left: `${chancePos}%` }}>
          chance
        </span>
        <span
          className={cn("figures absolute whitespace-nowrap font-mono", anchor(rawPos))}
          style={{ left: `${rawPos}%` }}
        >
          raw {pct(report.rawAgreement)}
        </span>
      </div>

      <figcaption className="sr-only">
        {kappa === null
          ? `κ is undefined. Raw agreement ${pct(report.rawAgreement)}.`
          : `κ ${coef(kappa)}${ci ? `, interval ${coef(ci.low)} to ${coef(ci.high)}` : ""}, in the ${STEPS[activeStep]?.label} band. Raw agreement ${pct(report.rawAgreement)}. Chance level is zero.`}
      </figcaption>
    </figure>
  );
}
