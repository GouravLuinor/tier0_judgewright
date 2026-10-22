/**
 * An honest comparison against the kinds of tool people already use for this
 * job, not against named products. Where another category is stronger, the
 * row says so.
 */

const COLUMNS = ["Judgewright", "Hosted eval platforms", "A notebook one-liner", "A spreadsheet", "Annotation tools"] as const;

const ROWS: { criterion: string; cells: [string, string, string, string, string] }[] = [
  {
    criterion: "Where your labels go",
    cells: [
      "Stay in your browser tab",
      "Uploaded to the vendor",
      "Stay on your machine",
      "Wherever the sheet lives",
      "Usually the tool's server",
    ],
  },
  {
    criterion: "Account needed",
    cells: ["No", "Yes", "No", "No", "Usually"],
  },
  {
    criterion: "Chance-corrected agreement",
    cells: [
      "κ and α, side by side with raw agreement",
      "Varies; raw agreement is common",
      "κ, if you call it",
      "Only if you build the formula",
      "Mostly human-to-human agreement",
    ],
  },
  {
    criterion: "An interval on κ",
    cells: ["Seeded bootstrap, reproducible", "Varies", "Only if you code it", "Rarely", "Rarely"],
  },
  {
    criterion: "Reading the disagreements",
    cells: [
      "Matrix filter and side-by-side critiques",
      "Usually strong",
      "Manual",
      "Filter and scroll",
      "Strong: it's where labels are made",
    ],
  },
  {
    criterion: "Runs the judge for you",
    cells: ["No: you bring the verdicts", "Yes", "You run it", "No", "No"],
  },
  {
    criterion: "History across runs",
    cells: ["No: one report at a time", "Yes", "Whatever you save", "Manual", "Some do"],
  },
];

export function CompareSection() {
  return (
    <section id="matrix" aria-labelledby="compare-title" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <h2 id="compare-title" className="text-2xl font-semibold tracking-[-0.01em] [font-stretch:87.5%] sm:text-3xl">
            How it compares
          </h2>
          <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">
            Judgewright does one job: it tells you how far to trust a judge you
            already run. If you need to run judges, store results or label
            data, the other kinds of tool are the better fit, and you can bring
            their verdicts here.
          </p>
        </div>

        {/* Wide screens: one table, the reading row by row */}
        <div className="mt-10 hidden overflow-hidden rounded-[3px] border border-line bg-panel md:block">
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <thead>
              <tr className="bg-sunk">
                <th scope="col" className="w-[16%] px-4 py-3 text-xs font-medium text-ink-3">
                  <span className="sr-only">Criterion</span>
                </th>
                {COLUMNS.map((column, i) => (
                  <th
                    key={column}
                    scope="col"
                    className={i === 0 ? "bg-bezel px-4 py-3 font-semibold text-bezel-ink" : "px-4 py-3 font-medium text-ink"}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.criterion} className="border-t border-line">
                  <th scope="row" className="px-4 py-3 align-top font-medium text-ink">
                    {row.criterion}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td key={COLUMNS[i]} className={i === 0 ? "bg-sunk/70 px-4 py-3 align-top text-ink" : "px-4 py-3 align-top text-ink-2"}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phones: Judgewright's answer up front, the field one tap away */}
        <div className="mt-8 border-t border-line md:hidden">
          {ROWS.map((row) => (
            <details key={row.criterion} className="group border-b border-line [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-3.5">
                <span>
                  <span className="block text-sm font-medium text-ink">{row.criterion}</span>
                  <span className="mt-0.5 block text-sm text-ink-2">{row.cells[0]}</span>
                </span>
                <span className="mt-0.5 shrink-0 text-xs text-ink-3 group-open:hidden">Others</span>
              </summary>
              <ul className="space-y-1 pb-4 text-sm leading-relaxed text-ink-2">
                {row.cells.slice(1).map((cell, i) => (
                  <li key={COLUMNS[i + 1]}>
                    <span className="text-ink-3">{COLUMNS[i + 1]}: </span>
                    {cell}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
