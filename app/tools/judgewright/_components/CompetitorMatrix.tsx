import { Check, Minus } from "lucide-react";

type Cell = boolean | string;

interface Row {
  capability: string;
  judgewright: Cell;
  spreadsheet: Cell;
  handrolled: Cell;
  platform: Cell;
}

const ROWS: Row[] = [
  {
    capability: "Privacy & ads",
    judgewright: "100% in-browser · zero ads",
    spreadsheet: "Stays local, no statistics",
    handrolled: "Local scripts, drift-prone",
    platform: "Uploads your eval set",
  },
  {
    capability: "Chance correction",
    judgewright: "κ and α with the agreement-to-κ deflation",
    spreadsheet: "Raw accuracy only",
    handrolled: "Whatever you remembered to implement",
    platform: "Accuracy dashboards",
  },
  {
    capability: "Uncertainty",
    judgewright: "Seeded bootstrap CIs, byte-reproducible",
    spreadsheet: "None",
    handrolled: "Only if you wrote it yourself",
    platform: "Aggregate significance claims",
  },
  {
    capability: "UI stays responsive",
    judgewright: "Off-thread worker · watchdog · honest fallback",
    spreadsheet: "n/a",
    handrolled: "Blocks the tab on large sets",
    platform: "Server-bound round trips",
  },
  {
    capability: "Reproducibility receipt",
    judgewright: true,
    spreadsheet: false,
    handrolled: false,
    platform: false,
  },
  {
    capability: "Account required",
    judgewright: false,
    spreadsheet: false,
    handrolled: false,
    platform: true,
  },
];

const BOOLEAN_LABELS: Record<string, { yes: string; no: string }> = {
  "Reproducibility receipt": { yes: "Every number carries one", no: "Not available" },
  "Account required": { yes: "Required", no: "Not required" },
};

function renderCell(
  cell: Cell,
  self: boolean,
  labels?: { yes: string; no: string }
) {
  const valueClass = self ? "text-zinc-100 font-medium" : "text-zinc-400";
  if (cell === true)
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <Check className="h-4 w-4 shrink-0 text-brand-lime" aria-hidden="true" />
        <span className={valueClass}>{labels?.yes ?? "Yes"}</span>
      </span>
    );
  if (cell === false)
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <Minus className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
        <span className={valueClass}>{labels?.no ?? "Not required"}</span>
      </span>
    );
  return <span className={valueClass}>{cell}</span>;
}

export function CompetitorMatrix() {
  return (
    <section
      id="matrix"
      className="mx-auto w-full max-w-7xl px-4 py-16 md:px-6 lg:px-8 scroll-mt-20"
      aria-labelledby="matrix-title"
    >
      <div className="max-w-3xl">
        <h2
          id="matrix-title"
          className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl"
        >
          Why Judgewright
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Judging a judge is usually done in a spreadsheet that stops at raw
          accuracy, or on a platform that wants your evaluation set uploaded.
          Judgewright keeps the arithmetic — chance-corrected agreement, the
          deflation against raw agreement, reproducible error bars — inside your
          browser, off the main thread, with no account and no upload.
        </p>
      </div>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-surface-border bg-surface-base glass-edge">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-surface-subtle/30">
              <th
                scope="col"
                className="px-4 py-3.5 font-mono text-xs uppercase tracking-wide text-zinc-400"
              >
                Capability
              </th>
              <th
                scope="col"
                className="bg-brand-lime/[0.05] px-4 py-3.5 font-mono text-xs uppercase tracking-wide font-semibold text-brand-lime"
              >
                Judgewright
              </th>
              <th
                scope="col"
                className="px-4 py-3.5 font-mono text-xs uppercase tracking-wide text-zinc-400"
              >
                Spreadsheet
              </th>
              <th
                scope="col"
                className="px-4 py-3.5 font-mono text-xs uppercase tracking-wide text-zinc-400"
              >
                Hand-rolled script
              </th>
              <th
                scope="col"
                className="px-4 py-3.5 font-mono text-xs uppercase tracking-wide text-zinc-400"
              >
                Eval platform
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr
                key={row.capability}
                className="border-b border-surface-border last:border-0 transition-colors hover:bg-surface-subtle/20"
              >
                <th
                  scope="row"
                  className="px-4 py-3.5 text-left font-medium text-zinc-200"
                >
                  {row.capability}
                </th>
                <td className="bg-brand-lime/[0.05] px-4 py-3.5">
                  {renderCell(
                    row.judgewright,
                    true,
                    BOOLEAN_LABELS[row.capability]
                  )}
                </td>
                <td className="px-4 py-3.5">
                  {renderCell(
                    row.spreadsheet,
                    false,
                    BOOLEAN_LABELS[row.capability]
                  )}
                </td>
                <td className="px-4 py-3.5">
                  {renderCell(
                    row.handrolled,
                    false,
                    BOOLEAN_LABELS[row.capability]
                  )}
                </td>
                <td className="px-4 py-3.5">
                  {renderCell(
                    row.platform,
                    false,
                    BOOLEAN_LABELS[row.capability]
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
