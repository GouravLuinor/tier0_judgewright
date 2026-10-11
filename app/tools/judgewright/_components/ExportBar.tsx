"use client";

import { Download } from "lucide-react";
import { copyTextToClipboard } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  renderAgreementJsonl,
  renderMarkdownReport,
  renderOneLineVerdict,
} from "../_lib/reportRender";
import { useAuthPromptStore } from "../_store/useAuthPromptStore";
import type { VerdictAnalysis } from "../_lib/types";

/**
 * The export bar. Instant-copy for each artifact plus a Download button — every
 * action is UNGATED: core work and export are 100% free (AGENTS §34/§38). Sign-in
 * is an OFFER, never a lock; the Download button opens the (dismissible) offer
 * after the file has already been produced, so a no-account export never
 * depends on it.
 */
function download(filename: string, text: string): boolean {
  try {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

async function copyArtifact(label: string, text: string): Promise<void> {
  const ok = await copyTextToClipboard(text);
  if (ok) {
    toast({ title: `${label} copied`, variant: "default" });
  } else {
    toast({
      title: `Could not copy ${label}`,
      description: "Use the Download button instead.",
      variant: "destructive",
    });
  }
}

export function ExportBar({ stats }: { stats: VerdictAnalysis }) {
  const openAuthPrompt = useAuthPromptStore((s) => s.open);
  const report = stats.report;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
        export
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void copyArtifact("Report card", renderMarkdownReport(report))}
      >
        Copy card
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          void copyArtifact("One-line verdict", renderOneLineVerdict(report))
        }
      >
        Copy one-liner
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          void copyArtifact("Agreement JSONL", renderAgreementJsonl(report))
        }
      >
        Copy JSONL
      </Button>
      <Button
        size="sm"
        variant="cyan"
        onClick={() => {
          const ok = download("judgewright-report.md", renderMarkdownReport(report));
          toast({
            title: ok ? "Report card downloaded" : "Download was blocked",
            variant: ok ? "default" : "destructive",
          });
          // The offer fires only once the file exists — it never gates the export.
          openAuthPrompt("export");
        }}
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Download
      </Button>
    </div>
  );
}
