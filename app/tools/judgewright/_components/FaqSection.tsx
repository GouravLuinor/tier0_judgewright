import React from "react";
import { ChevronDown } from "lucide-react";
import { SITE } from "@/lib/site";

/**
 * FAQPage JSON-LD derived from the SAME array the accordion renders — the
 * zero-drift rule of BAR §2.4. One source, two consumers.
 */
function buildFaqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: SITE.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };
}

export function FaqSection() {
  return (
    <section
      id="faq"
      className="mx-auto w-full max-w-4xl px-4 py-14 md:px-6 lg:px-8 scroll-mt-20"
      aria-labelledby="faq-title"
    >
      <div className="max-w-3xl">
        <h2
          id="faq-title"
          className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl"
        >
          Frequently answered questions
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          What Judgewright measures, how it keeps your verdicts in the browser,
          why raw agreement is not the headline, and how to reproduce every
          number it prints.
        </p>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqJsonLd()) }}
        />
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {SITE.faqs.map((faq, i) => (
          <details
            key={faq.q}
            className="group rounded-xl border border-surface-border bg-surface-base transition-colors open:border-surface-borderHover [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 text-sm font-medium text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime/40 rounded-xl hover:bg-surface-subtle/50 transition-colors">
              <span className="flex items-start gap-2.5 text-left">
                <span className="font-mono text-xs text-zinc-500 shrink-0 mt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{faq.q}</span>
              </span>
              <ChevronDown
                className="h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="px-4 pb-4 pt-1 pl-10 text-xs sm:text-sm leading-relaxed text-zinc-400 border-t border-surface-border/40 mt-1">
              {faq.a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
