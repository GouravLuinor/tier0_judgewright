"use client";

import { Copy, Cpu, Microscope, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { copyTextToClipboard } from "@/lib/utils";
import { useToolStore } from "../_store/useToolStore";

/**
 * The report station — the right-hand pane.
 *
 * Today it mirrors the placeholder worker output (character / word / byte /
 * line counts plus an echo of the analyzed paste) and carries the deferred
 * calibration report card, which stays an explicit placeholder until the
 * statistics milestone lands. The five interaction states are all rendered
 * here: idle · processing · error · degraded · ready.
 */
type ReportState = "idle" | "processing" | "error" | "ready";

export function ReportPane() {
  const stats = useToolStore((s) => s.stats);
  const isProcessing = useToolStore((s) => s.isProcessing);
  const errorMessage = useToolStore((s) => s.errorMessage);
  const degraded = useToolStore((s) => s.degraded);
  const isWorkerAvailable = useToolStore((s) => s.isWorkerAvailable);

  const state: ReportState = errorMessage
    ? "error"
    : stats
      ? "ready"
      : isProcessing
        ? "processing"
        : "idle";

  const handleCopy = async () => {
    if (!stats) return;
    const succeeded = await copyTextToClipboard(stats.echo);
    if (succeeded) {
      toast({ title: "Verdicts copied", description: "the analyzed paste" });
    } else {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div
      className="flex h-full min-h-[400px] flex-col overflow-hidden bg-surface-base/30 lg:min-h-0"
      data-report-state={state}
    >
      {/* Pane header */}
      <div className="flex items-center justify-between gap-2 border-b border-surface-border bg-surface-subtle/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Microscope className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Report
          </span>
        </div>
        <div className="flex items-center gap-2">
          {stats && (
            <Badge
              variant={stats.engine === "worker" ? "emerald" : "amber"}
              data-engine={stats.engine}
            >
              <Cpu className="h-3 w-3" aria-hidden="true" />
              {stats.engine === "worker" ? "worker" : "main-thread"}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            disabled={!stats}
            className="h-7 gap-1.5 px-2.5 text-xs text-zinc-300 hover:bg-surface-elevated hover:text-zinc-100 active:scale-[0.98]"
          >
            <Copy className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
            <span className="hidden sm:inline">Copy</span>
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
        {/* Degraded note — honest about which engine produced the numbers */}
        {(degraded || isWorkerAvailable === false) && (
          <p className="flex items-start gap-2 rounded-lg border border-brand-amber/30 bg-brand-amber/10 px-3 py-2 font-mono text-[11px] leading-relaxed text-brand-amber">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Computed on the main thread — same core, live budget capped.
          </p>
        )}

        {/* Error state */}
        {errorMessage && (
          <p
            id="report-error-message"
            className="flex items-start gap-2 rounded-lg border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 font-mono text-[11px] leading-relaxed text-brand-rose"
          >
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {errorMessage}
          </p>
        )}

        {/* Processing state */}
        {state === "processing" && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {["characters", "words", "bytes", "lines"].map((label) => (
              <div
                key={label}
                className="rounded-lg border border-surface-border bg-surface-subtle/40 p-3"
              >
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2 h-5 w-12" />
              </div>
            ))}
          </div>
        )}

        {/* Ready state — the placeholder measurement, mirrored live */}
        {stats && (
          <>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="characters" value={stats.characterCount} />
              <Stat label="words" value={stats.wordCount} />
              <Stat label="bytes" value={stats.byteCount} />
              <Stat label="lines" value={stats.lineCount} />
            </dl>

            <section
              aria-label="Analyzed paste"
              className="min-h-0 flex-1 overflow-hidden rounded-lg border border-surface-border bg-surface-default"
            >
              <div className="flex items-center justify-between border-b border-surface-border px-3 py-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                  echo of the analyzed paste
                </span>
                <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
                  {stats.executionTimeMs}ms
                </span>
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
                {stats.echo}
              </pre>
            </section>
          </>
        )}

        {/* Idle state */}
        {state === "idle" && (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-zinc-400">
            <Microscope className="mb-2 h-8 w-8 text-zinc-400" aria-hidden="true" />
            <p className="max-w-56 text-xs leading-relaxed">
              Paste your verdicts — the pipeline settles a report as they land.
            </p>
          </div>
        )}

        {/* Deferred to the statistics milestone */}
        <section
          aria-label="Calibration report card"
          className="rounded-xl border border-surface-border bg-surface-subtle/30 p-4"
        >
          <h3 className="text-sm font-semibold tracking-tight text-zinc-100">
            Calibration report card — compute enabled in next milestone
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">
            This card will carry the confusion matrix, the chance-corrected
            agreement headline, the agreement-to-κ deflation, Krippendorff&rsquo;s
            α, seeded reproducible bootstrap CIs and the letter grade — every
            figure with its reproducibility receipt. The worker pipeline,
            watchdog, debounce, degradation path and persistence are already in
            place, so the statistics land inside this shell without moving it.
          </p>
        </section>
      </div>
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
