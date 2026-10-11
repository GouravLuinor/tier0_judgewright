"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { useToolStore } from "../_store/useToolStore";
import { MAX_TABLE_ROWS } from "../_lib/constants";
import {
  DEFAULT_DIAGNOSIS_MODEL,
  DIAGNOSIS_CONFIGURE_COPY,
  DIAGNOSIS_ONE_CALL_COPY,
  DiagnosisError,
  buildDiagnosisRequest,
  isDiagnosisConfigured,
  llmDiagnosis,
  selectDiagnosisDisagreements,
} from "../_services/llmDiagnosis";
import type { DiagnosisResult } from "../_services/llmDiagnosis";

/**
 * The gated, opt-in, BYOK LLM diagnosis panel (AC-17/18/38, FM-16). OFF by
 * default: the page never calls it; the user configures a key and presses Get
 * diagnosis, which fires EXACTLY ONE OpenRouter request. The key lives only in
 * this component's React state — never in a store snapshot or localStorage, and
 * gone on reload. The request is abortable mid-flight (returns to configure-key)
 * and the exact transmitted payload (rubric + up to 25 disagreement rows) is
 * disclosed under "What we send".
 */
type DiagnosisState = "configure-key" | "loading" | "ready" | "error";

export function DiagnosisPanel() {
  const rubric = useToolStore((s) => s.rubric);
  const stats = useToolStore((s) => s.stats);

  // The whole flow holds the BYOK key in COMPONENT memory only (AC-17/18).
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState<string>(DEFAULT_DIAGNOSIS_MODEL);
  const [diagnosisState, setDiagnosisState] = useState<DiagnosisState>("configure-key");
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const keyInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const configured = isDiagnosisConfigured(apiKey);

  const rows = useMemo(() => {
    if (!stats) return [];
    return selectDiagnosisDisagreements(
      stats.report.disagreements,
      stats.report.confusion
    );
  }, [stats]);
  const request = useMemo(
    () => buildDiagnosisRequest(rubric, rows),
    [rubric, rows]
  );
  const disclosedPayload = request.body.messages[1]?.content ?? "";

  const run = useCallback(async () => {
    if (!configured) {
      // No-op without a key — never fire a request (AC-17).
      keyInputRef.current?.focus();
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setDiagnosisState("loading");
    setErrorMessage(null);
    try {
      const diagnosis = await llmDiagnosis(request, {
        apiKey,
        model,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setResult(diagnosis);
      setDiagnosisState("ready");
    } catch (error) {
      if (error instanceof DiagnosisError && error.kind === "aborted") {
        // AC-38: nothing was sent or stored; the key is still in memory.
        setResult(null);
        setDiagnosisState("configure-key");
        toast({ title: "Diagnosis aborted", variant: "destructive" });
        return;
      }
      setErrorMessage(
        error instanceof DiagnosisError
          ? error.message
          : "The diagnosis could not be produced."
      );
      setDiagnosisState("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [apiKey, model, request, configured]);

  const abort = useCallback(() => abortRef.current?.abort(), []);

  const purge = useCallback(() => {
    abortRef.current?.abort();
    setApiKey("");
    setResult(null);
    setErrorMessage(null);
    setDiagnosisState("configure-key");
  }, []);

  if (!stats) {
    return (
      <section
        aria-label="Optional AI diagnosis"
        className="rounded-lg border border-dashed border-surface-border bg-surface-subtle/30 p-3"
      >
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
          Optional AI diagnosis
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Compute a report first to unlock the diagnosis.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Optional AI diagnosis"
      data-testid="diagnosis-panel"
      className="rounded-lg border border-surface-border bg-surface-elevated/40 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
          AI diagnosis — 1 call, not logged
        </h3>
        <span className="rounded-full border border-surface-border bg-surface-subtle px-2 py-0.5 font-mono text-[10px] text-zinc-400">
          optional · your key · nothing stored
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
        {DIAGNOSIS_ONE_CALL_COPY} The ≤25 rows are drawn from the first{" "}
        {MAX_TABLE_ROWS.toLocaleString("en-US")} analyzed rows this session
        settled — the same window the table and the export read, so the
        selection never depends on which engine computed the report.
      </p>

      {diagnosisState === "configure-key" && (
        <div className="mt-2 space-y-2">
          <label className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="w-14">OpenRouter key</span>
            <input
              ref={keyInputRef}
              type="password"
              data-testid="diagnosis-key-input"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-or-…"
              autoComplete="off"
              className="min-w-40 flex-1 rounded-md border border-surface-border bg-surface-default px-2 py-1 font-mono text-xs text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime/70"
            />
          </label>
          <label className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="w-14">model</span>
            <input
              type="text"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="min-w-40 flex-1 rounded-md border border-surface-border bg-surface-default px-2 py-1 font-mono text-xs text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime/70"
            />
          </label>
          <p className="text-[10px] leading-relaxed text-zinc-500">
            {DIAGNOSIS_CONFIGURE_COPY}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="emerald"
              data-testid="diagnosis-get"
              onClick={() => void run()}
            >
              {configured ? "Get diagnosis" : "Configure a key"}
            </Button>
            <details className="group">
              <summary className="cursor-pointer text-[11px] text-zinc-400 hover:text-zinc-200">
                What we send ({rows.length} disagreement row
                {rows.length === 1 ? "" : "s"})
              </summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-surface-border bg-surface-default p-2 font-mono text-[10px] text-zinc-300">
                {disclosedPayload}
              </pre>
            </details>
          </div>
        </div>
      )}

      {diagnosisState === "loading" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="cyan" isLoading>
            Diagnosing…
          </Button>
          <Button size="sm" variant="ghost" data-testid="diagnosis-abort" onClick={abort}>
            Abort
          </Button>
          <span className="text-[10px] text-zinc-500">one call in flight — abortable</span>
        </div>
      )}

      {diagnosisState === "ready" && result && (
        <div className="mt-2 space-y-2" data-testid="diagnosis-result">
          <DiagnosisList label="Rubric holes" items={result.rubricHoles} />
          <DiagnosisList label="Bias flags" items={result.biasFlags} />
          <DiagnosisList label="Misapplications" items={result.misapplications} />
          <div>
            <h4 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
              Priority fix
            </h4>
            <p className="mt-0.5 text-xs text-zinc-100">{result.priorityFix}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => setDiagnosisState("configure-key")}>
              Run again
            </Button>
            <Button size="sm" variant="ghost" data-testid="diagnosis-purge" onClick={purge}>
              Purge diagnosis
            </Button>
          </div>
        </div>
      )}

      {diagnosisState === "error" && (
        <div className="mt-2 space-y-2" data-testid="diagnosis-error">
          <p className="rounded-md border border-brand-rose/40 bg-brand-rose/10 px-2 py-1.5 text-xs text-zinc-200">
            {errorMessage ?? "The diagnosis could not be produced."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setDiagnosisState("configure-key")}>
              Back
            </Button>
            <Button size="sm" variant="ghost" onClick={purge}>
              Purge diagnosis
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function DiagnosisList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <h4 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-500">none</p>
      ) : (
        <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-zinc-100">
          {items.map((item, index) => (
            <li key={`${label}-${index}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
