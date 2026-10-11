"use client";

import { Braces, FileText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { MAX_RUBRIC_CHARS } from "../_lib/constants";
import { useToolStore } from "../_store/useToolStore";

/**
 * The paste station: verdicts (JSONL or CSV) on top, the optional rubric
 * below. Both are controlled store fields and the only persisted content
 * (`judgewright-tool-storage`), so a reload restores the session — for a
 * paste over MAX_PERSISTED_TEXT_CHARS the store deliberately does NOT persist
 * the verdicts (an over-quota write would throw and lose the session), and the
 * error boundary says so plainly.
 */
export function RawEditorPane() {
  const verdictsText = useToolStore((s) => s.verdictsText);
  const setVerdictsText = useToolStore((s) => s.setVerdictsText);
  const rubric = useToolStore((s) => s.rubric);
  const setRubric = useToolStore((s) => s.setRubric);

  return (
    <div className="flex h-full min-h-[400px] flex-col overflow-hidden bg-surface-base/30 lg:min-h-0">
      {/* Pane header */}
      <div className="flex items-center justify-between border-b border-surface-border bg-surface-subtle/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Braces className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Verdicts
          </span>
        </div>
        <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
          {verdictsText.split("\n").filter((l) => l.trim()).length} rows
        </span>
      </div>

      {/* Verdicts editor */}
      <div className="px-4 pt-3 pb-2">
        <Textarea
          id="tool-verdicts-input"
          name="verdicts"
          mono
          value={verdictsText}
          onChange={(event) => setVerdictsText(event.target.value)}
          placeholder="Paste JSONL or CSV verdicts — one example per row"
          aria-label="Verdicts"
          spellCheck={false}
          autoComplete="off"
          className="h-48 resize-none leading-relaxed lg:h-40"
        />
      </div>

      {/* Rubric editor */}
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-3">
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
            <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              Rubric
            </span>
          </div>
          <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
            {rubric.length.toLocaleString("en-US")} /{" "}
            {MAX_RUBRIC_CHARS.toLocaleString("en-US")} chars
          </span>
        </div>
        <Textarea
          id="tool-rubric-input"
          name="rubric"
          value={rubric}
          onChange={(event) => setRubric(event.target.value)}
          maxLength={MAX_RUBRIC_CHARS}
          placeholder="Optional — the rubric the judge was graded against"
          aria-label="Rubric"
          spellCheck={false}
          className="min-h-24 flex-1 resize-none leading-relaxed"
        />
      </div>
    </div>
  );
}
