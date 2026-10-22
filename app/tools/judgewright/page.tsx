"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Toaster } from "@/components/ui/toast";
import { useToolWorker } from "./_hooks/useToolWorker";
import { useKeyboardShortcuts } from "./_hooks/useKeyboardShortcuts";
import { StatusLiveRegion } from "./_components/StatusLiveRegion";
import { CommandPalette } from "./_components/CommandPalette";
import { SignInModal } from "./_components/auth/SignInModal";
import { SiteHeader } from "./_components/shell/SiteHeader";
import { SiteFooter } from "./_components/shell/SiteFooter";
import { InputPanel } from "./_components/report/InputPanel";
import { VerdictPanel } from "./_components/report/VerdictPanel";
import { DisagreementInspector } from "./_components/report/DisagreementInspector";
import { SignalsSection } from "./_components/report/SignalsSection";
import { ShareSection } from "./_components/report/ShareSection";
import { CompareSection } from "./_components/landing/CompareSection";
import { MethodSection } from "./_components/landing/MethodSection";
import { FaqSection } from "./_components/landing/FaqSection";
import { useToolStore } from "./_store/useToolStore";

const PROMISES = ["Computed in your browser", "Nothing is uploaded", "No account needed"];

export default function ToolPage() {
  useToolWorker();
  useKeyboardShortcuts();

  const stats = useToolStore((s) => s.stats);
  const report = stats?.report ?? null;

  return (
    <div className="min-h-screen bg-ground text-ink">
      <a
        href="#workstation"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-[3px] focus:bg-select focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to workstation
      </a>

      <SiteHeader />

      <main className="w-full overflow-x-hidden">
        <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-8 sm:px-6 sm:pt-10 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <div className="max-w-3xl">
              <h1 className="text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.015em] [font-stretch:85%] sm:text-4xl lg:text-[2.75rem]">
                Calibrate your LLM judge against human labels
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-2 sm:text-[17px]">
                Paste your judge&rsquo;s verdicts next to human labels. You get a
                plain answer on whether to trust it, chance-corrected agreement
                (Cohen&rsquo;s κ) with an interval, and every example where they disagree.
              </p>
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2 lg:justify-end lg:pb-1">
              {PROMISES.map((promise) => (
                <li key={promise} className="flex items-center gap-2 whitespace-nowrap">
                  <span className="patch h-2 w-2 bg-agree" aria-hidden="true" />
                  {promise}
                </li>
              ))}
            </ul>
          </div>

          <section
            id="workstation"
            aria-label="Interactive workspace"
            className="mt-8 grid scroll-mt-20 gap-6 lg:grid-cols-[minmax(0,36fr)_minmax(0,64fr)] lg:gap-8"
          >
            <InputPanel />
            <VerdictPanel />
          </section>
        </div>

        {report && (
          <>
            <ReportSection
              id="failures"
              title="Where the judge and your humans part ways"
              lead={
                report.disagreementTotal === 0
                  ? "They agree on every row, so there is nothing to inspect here."
                  : `${report.disagreementTotal.toLocaleString("en-US")} of ${report.n.toLocaleString("en-US")} rows disagree. Pick a patch in the matrix to narrow the list, or a row to read both critiques.`
              }
            >
              <DisagreementInspector report={report} />
            </ReportSection>

            <ReportSection
              id="signals"
              title="Beyond κ"
              lead="The other readings a reviewer will ask about. Each one says what it needs when your file doesn't have it."
              collapsible
            >
              <SignalsSection report={report} />
            </ReportSection>

            <ReportSection
              id="share"
              title="Share the result"
              lead="Every export is free and works without an account."
              collapsible
            >
              <ShareSection report={report} />
            </ReportSection>
          </>
        )}

        <CompareSection />
        <MethodSection />
        <FaqSection />
      </main>

      <SiteFooter />

      <StatusLiveRegion />
      <CommandPalette />
      <SignInModal />
      <Toaster />
    </div>
  );
}

function ReportSection({
  id,
  title,
  lead,
  collapsible = false,
  children,
}: {
  id: string;
  title: string;
  lead: string;
  /** Folds to its heading on phones so the page stays a short scroll. */
  collapsible?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!collapsible) return;
    const query = window.matchMedia("(min-width: 768px)");
    setOpen(query.matches);
    const onChange = (event: MediaQueryListEvent) => setOpen(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [collapsible]);

  const heading = (
    <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-[-0.01em] [font-stretch:87.5%] sm:text-3xl">
      {title}
    </h2>
  );

  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 border-t border-line">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-12 sm:px-6 lg:px-8 lg:py-20">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-body`}
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-4 text-left md:pointer-events-none"
          >
            {heading}
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-ink-3 transition-transform duration-150 md:hidden ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
        ) : (
          heading
        )}
        <p className="figures mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">{lead}</p>
        <div id={`${id}-body`} hidden={!open} className="mt-8">
          {children}
        </div>
      </div>
    </section>
  );
}
