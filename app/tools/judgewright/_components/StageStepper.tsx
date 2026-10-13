"use client";

import { useMemo } from "react";
import { Check, ClipboardCopy, Database, Download, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Keycap } from "@/components/ui/keycap";
import { toast } from "@/components/ui/toast";
import { copyTextToClipboard } from "@/lib/utils";
import { SAMPLE_RUBRIC, SAMPLE_VERDICTS } from "../_lib/presets";
import { renderOneLineVerdict } from "../_lib/reportRender";
import { useToolStore, type StageId } from "../_store/useToolStore";

interface StageDef {
  id: StageId;
  label: string;
  stepNumber: number;
}

const STAGES: StageDef[] = [
  { id: "ingestion", label: "1. Ingestion", stepNumber: 1 },
  { id: "verdict", label: "2. Verdict", stepNumber: 2 },
  { id: "matrix", label: "3. Confusion Matrix", stepNumber: 3 },
  { id: "disagreements", label: "4. Disagreements", stepNumber: 4 },
  { id: "bias", label: "5. Bias Radar", stepNumber: 5 },
];

export function StageStepper() {
  const activeStage = useToolStore((s) => s.activeStage);
  const setActiveStage = useToolStore((s) => s.setActiveStage);
  const stats = useToolStore((s) => s.stats);
  const isSamplesOpen = useToolStore((s) => s.isSamplesOpen);
  const setSamplesOpen = useToolStore((s) => s.setSamplesOpen);
  const setVerdictsText = useToolStore((s) => s.setVerdictsText);
  const setRubric = useToolStore((s) => s.setRubric);
  const hasData = Boolean(stats);

  const activeIndex = useMemo(() => {
    const idx = STAGES.findIndex((s) => s.id === activeStage);
    return idx >= 0 ? idx : 0;
  }, [activeStage]);

  const loadSample = () => {
    setVerdictsText(SAMPLE_VERDICTS);
    setRubric(SAMPLE_RUBRIC);
    setSamplesOpen(false);
  };

  const handleCopy = async () => {
    const current = useToolStore.getState();
    const summary = current.stats
      ? renderOneLineVerdict(current.stats.report)
      : "";

    if (!summary) {
      toast({
        title: "Nothing to copy yet",
        description: "The report settles as soon as the paste lands.",
        variant: "destructive",
      });
      return;
    }

    const succeeded = await copyTextToClipboard(summary);
    if (succeeded) {
      toast({
        title: "Verdict copied",
        description: "the one-line verdict",
      });
    } else {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-4">
      {/* 5-Stage Workflow Stepper Bar */}
      <nav
        aria-label="Workflow Stepper"
        className="flex items-center overflow-x-auto rounded-full border border-surface-border bg-surface-subtle p-1.5 shadow-sm scrollbar-none"
      >
        {STAGES.map((stage, idx) => {
          const isActive = stage.id === activeStage;
          const isCompleted = hasData && idx < activeIndex;

          return (
            <div key={stage.id} className="flex items-center">
              <button
                type="button"
                onClick={() => setActiveStage(stage.id)}
                className={`group flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition-all duration-150 active:scale-[0.98] ${
                  isActive
                    ? "border border-brand-lime/60 bg-brand-lime/15 text-brand-lime shadow-sm"
                    : isCompleted
                      ? "text-zinc-200 hover:bg-surface-elevated hover:text-zinc-100"
                      : "text-zinc-400 hover:bg-surface-elevated hover:text-zinc-200"
                }`}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5 text-brand-lime" aria-hidden="true" />
                ) : (
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[11px] font-mono font-bold ${
                      isActive ? "text-brand-lime" : "text-zinc-400"
                    }`}
                  >
                    {stage.stepNumber}
                  </span>
                )}
                <span>{stage.label.replace(/^\d+\.\s*/, "")}</span>
              </button>

              {idx < STAGES.length - 1 && (
                <span className="mx-1 text-zinc-500/50 text-xs" aria-hidden="true">
                  ›
                </span>
              )}
            </div>
          );
        })}
      </nav>

      {/* Quick Actions Group */}
      <div className="flex items-center gap-2.5">
        <DropdownMenu open={isSamplesOpen} onOpenChange={setSamplesOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 rounded-xl border-surface-border bg-surface-base text-xs font-semibold text-zinc-200 hover:border-surface-borderHover hover:bg-surface-elevated hover:text-zinc-100 active:scale-[0.98] shadow-sm"
              aria-label="Load a sample verdict set"
            >
              <Database className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
              <span>Samples</span>
              <Keycap size="xs">⌘P</Keycap>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="border-surface-border bg-surface-base text-zinc-200 shadow-elevated"
          >
            <DropdownMenuItem
              onClick={loadSample}
              className="cursor-pointer gap-2 text-xs font-medium text-zinc-200 focus:bg-surface-elevated focus:text-zinc-100"
            >
              <Play className="h-3.5 w-3.5 text-brand-lime" aria-hidden="true" />
              Demo verdicts — twelve rows
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          disabled={!hasData}
          className="h-9 gap-2 rounded-xl border-surface-border bg-surface-base text-xs font-semibold text-zinc-200 hover:border-surface-borderHover hover:bg-surface-elevated hover:text-zinc-100 active:scale-[0.98] transition-all shadow-sm"
        >
          <ClipboardCopy className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          <span>Copy report</span>
          <Keycap size="xs">⌘⇧C</Keycap>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setActiveStage(activeStage === "export" ? "verdict" : "export")}
          className={`h-9 gap-2 rounded-xl border text-xs font-semibold transition-all active:scale-[0.98] shadow-sm ${
            activeStage === "export"
              ? "border-brand-lime bg-brand-lime/15 text-brand-lime"
              : "border-surface-border bg-surface-base text-zinc-200 hover:border-surface-borderHover hover:bg-surface-elevated hover:text-zinc-100"
          }`}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Export</span>
        </Button>
      </div>
    </div>
  );
}
