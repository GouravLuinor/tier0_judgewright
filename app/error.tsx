"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { MAX_PERSISTED_TEXT_CHARS } from "./tools/judgewright/_lib/constants";

/**
 * Route-level error boundary for the app router. A thrown render error must
 * still leave a usable, on-brand surface — never a white screen. The copy is
 * honest about persistence (A1): only sessions under MAX_PERSISTED_TEXT_CHARS
 * survive a reload, because an over-quota localStorage write is exactly the
 * class of failure that lands here.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 py-16">
      <div className="flex items-center gap-2 text-brand-rose">
        <TriangleAlert className="h-5 w-5" aria-hidden="true" />
        <h1 className="text-lg font-semibold tracking-tight">Something broke</h1>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        The workstation hit an unexpected error. Sessions are saved for reload
        only while the verdicts stay under{" "}
        {MAX_PERSISTED_TEXT_CHARS.toLocaleString("en-US")} characters — a larger
        paste is not stored, so keep a copy outside the browser until you have
        exported what you need.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex h-9 w-fit items-center justify-center rounded-lg border border-surface-border bg-surface-subtle px-4 text-sm font-medium text-zinc-200 transition-[background-color,border-color,color,transform] duration-150 ease-out-expo hover:border-surface-borderHover hover:bg-surface-elevated active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime/70 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
      >
        Try again
      </button>
    </div>
  );
}
