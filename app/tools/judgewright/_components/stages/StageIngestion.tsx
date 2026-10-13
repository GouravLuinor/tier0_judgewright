"use client";

import { useCallback, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Braces,
  CheckCircle2,
  FileText,
  FileUp,
  FlaskConical,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { MAX_RUBRIC_CHARS } from "../../_lib/constants";
import { SAMPLE_RUBRIC, SAMPLE_VERDICTS } from "../../_lib/presets";
import { useToolStore } from "../../_store/useToolStore";

export function StageIngestion() {
  const verdictsText = useToolStore((s) => s.verdictsText);
  const setVerdictsText = useToolStore((s) => s.setVerdictsText);
  const rubric = useToolStore((s) => s.rubric);
  const setRubric = useToolStore((s) => s.setRubric);
  const stats = useToolStore((s) => s.stats);
  const parseIssues = useToolStore((s) => s.parseIssues);
  const parseIssueCount = useToolStore((s) => s.parseIssueCount);
  const setActiveStage = useToolStore((s) => s.setActiveStage);

  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const rowCount = verdictsText.split("\n").filter((l) => l.trim()).length;
  const hasData = rowCount > 0;

  const handleFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        setVerdictsText(text);
        toast({
          title: "File loaded",
          description: `${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
        });
      } catch (err) {
        toast({
          title: "Error reading file",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [setVerdictsText]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        void handleFile(file);
      }
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        void handleFile(file);
      }
    },
    [handleFile]
  );

  const loadDemo = useCallback(() => {
    setVerdictsText(SAMPLE_VERDICTS);
    setRubric(SAMPLE_RUBRIC);
    toast({
      title: "Demo dataset loaded",
      description: "12 binary verdicts with sample rubric",
    });
  }, [setVerdictsText, setRubric]);

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".jsonl,.csv,.txt"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Two Clean Separate Floating Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Card: Minimalist Drag & Drop Zone */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border border-surface-border bg-surface-base p-6 sm:p-7 shadow-sm">
          <div>
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center transition-all duration-150 ${
                isDragOver
                  ? "border-brand-lime bg-brand-lime/[0.08]"
                  : "border-surface-border bg-surface-subtle hover:border-surface-borderHover hover:bg-surface-elevated"
              }`}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-surface-border bg-surface-base shadow-sm transition-transform duration-150 group-hover:scale-105">
                <UploadCloud className="h-7 w-7 text-brand-lime" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-base sm:text-lg font-bold tracking-tight text-zinc-100">
                Drop your verdict file (.jsonl / .csv)
              </h3>
              <p className="mt-1.5 text-xs text-zinc-400">
                Parsed locally in Web Worker · zero server egress
              </p>
            </div>

            {/* Quick Actions */}
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadDemo}
                className="h-9 gap-2 rounded-xl border-surface-border bg-surface-subtle text-xs font-semibold text-zinc-200 hover:border-brand-lime hover:text-brand-lime active:scale-[0.98] transition-all"
              >
                <FlaskConical className="h-4 w-4 text-brand-lime" aria-hidden="true" />
                <span>Load 12 Demo Rows</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-9 gap-2 rounded-xl border-surface-border bg-surface-subtle text-xs font-semibold text-zinc-300 hover:border-surface-borderHover hover:text-zinc-100 active:scale-[0.98] transition-all"
              >
                <FileUp className="h-4 w-4" aria-hidden="true" />
                <span>Browse Files</span>
              </Button>
            </div>
          </div>

          {/* Format Spec Note */}
          <div className="mt-6 rounded-xl border border-surface-border bg-surface-subtle p-3.5 text-xs text-zinc-400 font-mono leading-relaxed">
            Required columns: <span className="text-brand-lime font-bold">example_id</span>,{" "}
            <span className="text-zinc-200 font-semibold">judge_label</span>,{" "}
            <span className="text-zinc-200 font-semibold">human_label</span>
          </div>
        </div>

        {/* Right Card: Direct Raw Textarea Input */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-surface-border bg-surface-base p-6 sm:p-7 shadow-sm space-y-5">
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <label htmlFor="tool-verdicts-input" className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-200">
                <Braces className="h-4 w-4 text-brand-lime" />
                <span>Verdicts JSONL / CSV</span>
                <span className="rounded-md bg-surface-subtle border border-surface-border px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                  {rowCount} rows
                </span>
              </label>
              <span className="text-xs text-zinc-400 font-mono">one row per example</span>
            </div>

            <Textarea
              id="tool-verdicts-input"
              name="verdicts"
              mono
              value={verdictsText}
              onChange={(e) => setVerdictsText(e.target.value)}
              placeholder='Paste JSONL or CSV verdicts — e.g. {"example_id":"1","judge_label":"pass","human_label":"pass"}'
              aria-label="Verdicts"
              spellCheck={false}
              autoComplete="off"
              className="h-52 resize-y leading-relaxed font-mono text-xs sm:text-sm border-surface-border bg-surface-subtle text-zinc-100 placeholder:text-zinc-500 focus:border-brand-lime focus:ring-brand-lime"
            />
          </div>

          <div className="pt-3 border-t border-surface-border">
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="tool-rubric-input" className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-200">
                <FileText className="h-4 w-4 text-zinc-400" />
                <span>Evaluation Rubric</span>
                <span className="rounded-md bg-surface-subtle border border-surface-border px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                  {rubric.length} / {MAX_RUBRIC_CHARS}
                </span>
              </label>
              <span className="text-xs text-zinc-400 font-mono">optional instructions for diagnosis</span>
            </div>

            <Textarea
              id="tool-rubric-input"
              name="rubric"
              value={rubric}
              onChange={(e) => setRubric(e.target.value)}
              maxLength={MAX_RUBRIC_CHARS}
              placeholder="Optional — markdown rubric instructions for BYOK diagnosis"
              aria-label="Rubric"
              spellCheck={false}
              className="h-24 resize-y leading-relaxed text-xs sm:text-sm border-surface-border bg-surface-subtle text-zinc-100 placeholder:text-zinc-500 focus:border-brand-lime focus:ring-brand-lime"
            />
          </div>
        </div>
      </div>

      {/* Stage Bottom Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-surface-border bg-surface-subtle px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          {hasData && stats ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 font-mono text-xs sm:text-sm text-brand-lime font-semibold">
                <CheckCircle2 className="h-4 w-4" /> {rowCount.toLocaleString("en-US")} valid rows loaded
              </span>
              <span className="text-zinc-500">•</span>
              <span className="font-mono text-xs sm:text-sm text-zinc-300">
                {stats.report.binary ? "binary: pass / fail" : `${stats.report.labels.length}-class labels`}
              </span>
              {parseIssues.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-brand-amber/15 px-2.5 py-0.5 font-mono text-[11px] text-brand-amber font-medium">
                  <AlertCircle className="h-3.5 w-3.5" /> {parseIssueCount} skipped
                </span>
              )}
            </div>
          ) : (
            <span className="font-mono text-xs sm:text-sm text-zinc-400">
              Paste or load data above to begin calibration
            </span>
          )}
        </div>

        <Button
          type="button"
          disabled={!hasData}
          onClick={() => setActiveStage("verdict")}
          className="h-10 gap-2 rounded-xl bg-zinc-100 px-6 text-xs font-bold text-zinc-950 transition-all hover:bg-white hover:shadow active:scale-[0.98] disabled:opacity-40"
        >
          <span>Analyze &amp; View Verdict</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
