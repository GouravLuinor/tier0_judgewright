import { ArrowUpRight } from "lucide-react";
import { FAMILY_TOOLS, NORAI_URL, SITE } from "@/lib/site";
import { BrandMark, NorAiMark } from "./BrandMark";

const HERE = [
  { href: "#workstation", label: "Calibrate a judge" },
  { href: "#guide", label: "Method and input format" },
  { href: "#matrix", label: "How it compares" },
  { href: "#faq", label: "FAQ" },
];

/** The family thread, set in the bezel: Nor AI mark, sibling tools, year. */
export function SiteFooter() {
  const year = new Date().getFullYear();
  const siblings = FAMILY_TOOLS.filter((tool) => tool.name !== SITE.name);

  return (
    <footer className="bg-bezel text-bezel-ink">
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-8 pt-14 sm:px-6 lg:px-8">
        <div className="grid gap-12 md:grid-cols-[1.2fr_1fr_1.4fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <span className="text-[17px] font-semibold [font-stretch:87.5%]">Judgewright</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-bezel-muted">
              Calibrate an LLM judge against human labels. Computed in your
              browser; nothing is uploaded.
            </p>
            <a
              href={NORAI_URL}
              className="mt-6 inline-flex items-center gap-2 rounded-[3px] text-sm text-bezel-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select focus-visible:ring-offset-2 focus-visible:ring-offset-bezel"
            >
              <NorAiMark />
              Built by Nor AI
            </a>
          </div>

          <nav aria-labelledby="footer-here">
            <h2 id="footer-here" className="text-sm font-medium text-bezel-ink">
              On this page
            </h2>
            <ul className="mt-4 space-y-2.5">
              {HERE.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-bezel-muted hover:text-bezel-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-family">
            <h2 id="footer-family" className="text-sm font-medium text-bezel-ink">
              More free tools
            </h2>
            <ul className="mt-4 space-y-3">
              {siblings.map((tool) => (
                <li key={tool.href}>
                  <a
                    href={tool.href}
                    className="group flex items-baseline gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select"
                  >
                    <span className="text-sm text-bezel-ink group-hover:underline">{tool.name}</span>
                    <span className="text-sm text-bezel-muted">{tool.blurb}</span>
                    <ArrowUpRight className="h-3 w-3 shrink-0 self-center text-bezel-muted" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-bezel-line pt-5 text-xs text-bezel-muted sm:flex-row sm:justify-between">
          <p className="figures">© {year} Nor AI</p>
          <p>
            MIT licensed. Statistics are computed in a Web Worker in your tab;
            sign-in is optional.
          </p>
        </div>
      </div>
    </footer>
  );
}
