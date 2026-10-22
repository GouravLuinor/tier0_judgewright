import { Plus } from "lucide-react";
import { SITE } from "@/lib/site";

/**
 * FAQPage JSON-LD derived from the SAME array the accordion renders, so the
 * structured data and the page can never drift apart.
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
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20">
      <div className="mx-auto grid w-full max-w-[1400px] gap-8 px-4 py-16 sm:px-6 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-12 lg:px-8 lg:py-24">
        <div>
          <h2 id="faq-title" className="text-2xl font-semibold tracking-[-0.01em] [font-stretch:87.5%] sm:text-3xl">
            Questions
          </h2>
          <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-ink-2">
            What the numbers mean, where your verdicts go, and how someone else
            can check your result.
          </p>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqJsonLd()) }} />
        </div>

        <div className="border-t border-line">
          {SITE.faqs.map((faq) => (
            <details key={faq.q} className="group border-b border-line [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-4 text-base font-medium text-ink transition-colors duration-150 hover:text-select-ink">
                <span>{faq.q}</span>
                <Plus
                  className="mt-1 h-4 w-4 shrink-0 text-ink-3 transition-transform duration-150 group-open:rotate-45"
                  aria-hidden="true"
                />
              </summary>
              <p className="max-w-prose pb-5 text-[15px] leading-relaxed text-ink-2">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
