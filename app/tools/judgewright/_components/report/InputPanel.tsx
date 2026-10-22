"use client";

import { useRef, useState } from "react";
import { Eraser, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Keycap } from "@/components/ui/keycap";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useToolStore } from "../../_store/useToolStore";
import { SamplesMenu } from "../shell/SamplesMenu";

const ACCEPT = ".jsonl,.csv,.txt,.json";

/**
 * The paste station. One field, one job: the verdict rows. A file can be
 * dropped on the field or picked from disk; either way the text lands in the
 * same controlled store field the paste uses, so nothing is uploaded.
 */
export function InputPanel() {
  const verdictsText = useToolStore((s) => s.verdictsText);
  const setVerdictsText = useToolStore((s) => s.setVerdictsText);
  const reset = useToolStore((s) => s.reset);
  const stats = useToolStore((s) => s.stats);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function readFile(file: File | undefined) {
    if (!file) return;
    try {
      setVerdictsText(await file.text());
      toast({ title: "File loaded", description: `${file.name} was read in this tab, not uploaded.` });
    } catch {
      toast({
        title: "Could not read that file",
        description: "Save it as UTF-8 JSONL or CSV and try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <section aria-labelledby="input-title" className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="input-title" className="mr-auto text-lg font-semibold [font-stretch:87.5%]">
          Your verdicts
        </h2>
        <SamplesMenu />
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <FileUp className="h-4 w-4" aria-hidden="true" />
          Open file
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          disabled={verdictsText.length === 0}
          aria-label="Clear verdicts"
        >
          <Eraser className="h-4 w-4" aria-hidden="true" />
          Clear
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            void readFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>

      <p id="input-help" className="mt-1.5 text-sm leading-relaxed text-ink-2">
        One row per example, as JSONL or CSV, with an id, the judge&rsquo;s label
        and the human label. Drop a file on the field or paste.
      </p>

      <div
        className="relative mt-3 flex min-h-0 flex-1 flex-col"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void readFile(event.dataTransfer.files?.[0]);
        }}
      >
        <label htmlFor="tool-verdicts-input" className="sr-only">
          Verdicts, JSONL or CSV
        </label>
        <Textarea
          id="tool-verdicts-input"
          name="verdicts"
          mono
          value={verdictsText}
          onChange={(event) => setVerdictsText(event.target.value)}
          placeholder={'{"example_id":"ex-001","judge_label":"pass","human_label":"fail"}'}
          aria-describedby="input-help"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          className={cn(
            "h-56 flex-1 resize-y whitespace-pre lg:h-auto lg:min-h-[22rem]",
            dragging && "border-select ring-1 ring-select"
          )}
        />
        {dragging && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-[3px] bg-select/10 text-sm font-medium text-select-ink">
            Drop to read the file in this tab
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        {stats ? (
          <dl className="figures flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ink-3">
            <Count label="characters" value={stats.characterCount} />
            <Count label="words" value={stats.wordCount} />
            <Count label="bytes" value={stats.byteCount} />
            <Count label="lines" value={stats.lineCount} />
          </dl>
        ) : (
          <span />
        )}
        <span className="hidden items-center gap-1 text-xs text-ink-3 lg:inline-flex">
          <Keycap size="xs">⌘↵</Keycap> focuses this field
        </span>
      </div>
    </section>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div data-stat={label} className="flex flex-row-reverse items-baseline justify-end gap-1">
      <dt>{label}</dt>
      <dd className="text-ink-2">{value.toLocaleString("en-US")}</dd>
    </div>
  );
}
