"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { bootstrapTierCopy } from "../../_lib/bootstrapCI";
import { MAX_TABLE_ROWS } from "../../_lib/constants";
import { renderAgreementJsonl, renderMarkdownReport, renderOneLineVerdict } from "../../_lib/reportRender";
import { isSupabaseConfigured } from "../../_lib/supabaseClient";
import type { CalibrationReport } from "../../_lib/types";
import { useAuthPromptStore } from "../../_store/useAuthPromptStore";
import { copyArtifact, downloadText } from "./exportActions";

const count = (value: number) => value.toLocaleString("en-US");

/**
 * Taking the result elsewhere: three copies and a download, every one free and
 * ungated, then the receipt a reviewer recomputes κ from. The JSONL is scoped
 * to the display window, and the caption says so with the true totals beside it.
 */
export function ShareSection({ report }: { report: CalibrationReport }) {
  const offerAfterExport = useAuthPromptStore((s) => s.offerAfterExport);

  const jsonlScope =
    report.disagreements.length < report.n
      ? `JSONL carries ${count(report.disagreements.length)} rows within the first ${count(MAX_TABLE_ROWS)} shown · ${count(report.agreementTotal)} agreements and ${count(report.disagreementTotal)} disagreements in the full ${count(report.n)}-row set — the same window on both engines`
      : `JSONL carries all ${count(report.n)} analyzed rows — the whole set fits inside the display window`;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void copyArtifact("Report card", renderMarkdownReport(report))}>
            Copy card
          </Button>
          <Button variant="outline" onClick={() => void copyArtifact("One-line verdict", renderOneLineVerdict(report))}>
            Copy one-liner
          </Button>
          <Button variant="outline" onClick={() => void copyArtifact("Agreement JSONL", renderAgreementJsonl(report))}>
            Copy JSONL
          </Button>
          <Button
            onClick={() => {
              const ok = downloadText("judgewright-report.md", renderMarkdownReport(report));
              toast({
                title: ok ? "Report card downloaded" : "The download was blocked",
                description: ok ? "judgewright-report.md, a Markdown file." : "Allow downloads for this site, or use Copy card.",
                variant: ok ? "default" : "destructive",
              });
              // An offer after the file exists, once per session, and only
              // when sign-in is actually switched on for this deployment.
              if (ok && isSupabaseConfigured) offerAfterExport();
            }}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download
          </Button>
          <p data-export-scope className="figures mt-2 w-full text-xs leading-relaxed text-ink-3">
            {jsonlScope}
          </p>
        </div>

        <dl className="mt-8 space-y-4 text-sm leading-relaxed">
          <div>
            <dt className="font-medium text-ink">Copy card</dt>
            <dd className="text-ink-2">The whole report as Markdown, for a pull request or a doc.</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Copy one-liner</dt>
            <dd className="text-ink-2">One line with n, accuracy, κ and its interval, the grade and the baseline, for a commit message or a chat thread.</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Copy JSONL</dt>
            <dd className="text-ink-2">One line per row with both labels and whether they agree, for your own analysis.</dd>
          </div>
        </dl>
      </div>

      <div className="min-w-0">
        <h3 className="text-base font-semibold [font-stretch:92%]">Receipt</h3>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-2">
          The formula and the exact inputs, so anyone can recompute κ by hand.
          The same rows and seed give the same numbers, digit for digit.
        </p>
        <pre
          data-receipt
          className="mt-3 max-h-[26rem] overflow-auto rounded-[3px] bg-bezel p-4 font-mono text-xs leading-relaxed text-bezel-ink"
        >
          {report.receipt}
        </pre>
        {report.ci.accuracy !== null && (
          <p data-bootstrap-tier className="figures mt-2 font-mono text-xs leading-relaxed text-ink-3">
            {bootstrapTierCopy(report.n)} · seed {report.ci.accuracy.seed} · percentile intervals, index-resampled
          </p>
        )}
      </div>
    </div>
  );
}
