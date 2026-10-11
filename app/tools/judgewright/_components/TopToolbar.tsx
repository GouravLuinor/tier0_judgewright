"use client";

import { ClipboardCopy, Database, Eraser, FlaskConical, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Keycap } from "@/components/ui/keycap";
import { toast } from "@/components/ui/toast";
import { copyTextToClipboard } from "@/lib/utils";
import {
  AUTO_DIAGNOSIS_ENABLED,
  AUTO_DIAGNOSIS_OFF_COPY,
} from "../_lib/constants";
import { SAMPLE_RUBRIC, SAMPLE_VERDICTS } from "../_lib/presets";
import { useToolStore } from "../_store/useToolStore";

/**
 * Workstation toolbar. Inline menus only — the command palette (⌘K) and the
 * sign-in modal are mounted globally, never from here (BAR §2.5).
 *
 * The optional LLM diagnosis is NOT armed from the toolbar: with no key it is
 * a clean no-op, and it is never automatic (AUTO_DIAGNOSIS_ENABLED is false),
 * which is what keeps the default path at zero egress.
 */
export function TopToolbar() {
  const isSamplesOpen = useToolStore((s) => s.isSamplesOpen);
  const setSamplesOpen = useToolStore((s) => s.setSamplesOpen);
  const setVerdictsText = useToolStore((s) => s.setVerdictsText);
  const setRubric = useToolStore((s) => s.setRubric);
  const stats = useToolStore((s) => s.stats);
  const isProcessing = useToolStore((s) => s.isProcessing);
  const errorMessage = useToolStore((s) => s.errorMessage);

  const loadSample = () => {
    setVerdictsText(SAMPLE_VERDICTS);
    setRubric(SAMPLE_RUBRIC);
    setSamplesOpen(false);
  };

  const handleCopy = async () => {
    const current = useToolStore.getState();
    const summary = current.stats
      ? [
          `Judgewright placeholder report`,
          `characters: ${current.stats.characterCount}`,
          `words: ${current.stats.wordCount}`,
          `bytes: ${current.stats.byteCount}`,
          `lines: ${current.stats.lineCount}`,
          `engine: ${current.stats.engine}`,
        ].join("\n")
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
      toast({ title: "Report copied", description: "placeholder report card" });
    } else {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-surface-base/80 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Sample fixture — inline menu, never a modal */}
        <DropdownMenu open={isSamplesOpen} onOpenChange={setSamplesOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-surface-border bg-surface-default text-xs text-zinc-300 hover:border-surface-borderHover hover:bg-surface-elevated active:scale-[0.98]"
              aria-label="Load a sample verdict set"
            >
              <Database className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
              <span>Samples</span>
              <Keycap size="xs">⌘P</Keycap>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="border-surface-border bg-surface-default"
          >
            <DropdownMenuItem
              onClick={loadSample}
              className="cursor-pointer gap-2 text-xs text-zinc-300 focus:bg-surface-elevated focus:text-zinc-100"
            >
              <Play className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
              Demo verdicts — twelve rows
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            useToolStore.getState().reset();
          }}
          disabled={isProcessing}
          className="h-8 gap-1.5 border-surface-border bg-surface-default text-xs text-zinc-300 hover:border-surface-borderHover hover:bg-surface-elevated active:scale-[0.98]"
        >
          <Eraser className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          <span>Clear</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          disabled={!stats || Boolean(errorMessage)}
          className="h-8 gap-1.5 border-surface-border bg-surface-default text-xs text-zinc-300 hover:border-surface-borderHover hover:bg-surface-elevated active:scale-[0.98]"
        >
          <ClipboardCopy className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          <span className="hidden sm:inline">Copy report</span>
          <span className="sm:hidden">Copy</span>
          <Keycap size="xs">⌘⇧C</Keycap>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-default items-center gap-1.5 rounded-md border border-surface-border bg-surface-subtle/60 px-2 py-1 font-mono text-[11px] text-zinc-400">
                <FlaskConical className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                <span>{AUTO_DIAGNOSIS_OFF_COPY}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {AUTO_DIAGNOSIS_ENABLED
                ? "Auto-diagnosis is armed."
                : "Auto-diagnosis is off. Nothing is ever sent anywhere on its own — the optional diagnosis is armed only when you supply a key, as a single opt-in call."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {isProcessing && (
          <div
            role="status"
            aria-label="Analyzing verdicts"
            className="flex h-7 items-center gap-1.5 rounded-full border border-surface-border bg-surface-subtle px-2.5 font-mono text-[11px] text-zinc-300"
          >
            <span
              className="h-2 w-2 animate-spin rounded-full border-2 border-brand-lime/30 border-t-brand-lime motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span>Computing…</span>
          </div>
        )}
      </div>
    </header>
  );
}
