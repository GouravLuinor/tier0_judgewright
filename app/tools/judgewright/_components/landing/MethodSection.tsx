"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { GUIDE_TABS } from "../../_lib/guide";

/** Method and input format: the guide tabs as an index beside one open page. */
export function MethodSection() {
  const [active, setActive] = useState(GUIDE_TABS[0]?.id ?? "");
  const tab = GUIDE_TABS.find((t) => t.id === active) ?? GUIDE_TABS[0];

  return (
    <section id="guide" aria-labelledby="guide-title" className="scroll-mt-20 border-t border-line bg-panel">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <h2 id="guide-title" className="text-2xl font-semibold tracking-[-0.01em] [font-stretch:87.5%] sm:text-3xl">
          Method and input format
        </h2>

        <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-12">
          <div
            role="tablist"
            aria-label="Method topics"
            aria-orientation="vertical"
            onKeyDown={(event) => {
              const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"];
              if (!keys.includes(event.key)) return;
              event.preventDefault();
              const index = GUIDE_TABS.findIndex((t) => t.id === tab?.id);
              const delta = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
              const next = GUIDE_TABS[(index + delta + GUIDE_TABS.length) % GUIDE_TABS.length];
              if (!next) return;
              setActive(next.id);
              document.getElementById(`guide-tab-${next.id}`)?.focus();
            }}
            className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:overflow-visible md:px-0"
          >
            {GUIDE_TABS.map((item) => {
              const selected = item.id === tab?.id;
              return (
                <button
                  key={item.id}
                  id={`guide-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  aria-controls={`guide-panel-${item.id}`}
                  onClick={() => setActive(item.id)}
                  className={cn(
                    "shrink-0 rounded-[3px] px-3 py-2 text-left text-sm transition-colors duration-150",
                    selected ? "bg-bezel text-bezel-ink" : "text-ink-2 hover:bg-sunk hover:text-ink"
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {tab && (
            <div
              role="tabpanel"
              id={`guide-panel-${tab.id}`}
              aria-labelledby={`guide-tab-${tab.id}`}
              className="min-w-0"
            >
              <h3 className="text-xl font-semibold [font-stretch:92%]">{tab.title}</h3>
              <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-ink-2">{tab.blurb}</p>
              <pre className="mt-5 overflow-x-auto rounded-[3px] bg-bezel p-4 font-mono text-xs leading-relaxed text-bezel-ink sm:text-[13px]">
                {tab.code}
              </pre>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
