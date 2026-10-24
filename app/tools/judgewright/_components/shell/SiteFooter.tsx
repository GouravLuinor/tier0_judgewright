import { ArrowUpRight } from "lucide-react";
import { COMPANY, FAMILY_TOOLS, SITE } from "@/lib/site";
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
              href={COMPANY.url}
              className="mt-6 inline-flex items-center gap-2 rounded-[3px] text-sm font-medium text-bezel-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select focus-visible:ring-offset-2 focus-visible:ring-offset-bezel"
            >
              <NorAiMark size={22} />
              Judgewright by Nor AI
            </a>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-bezel-muted">{COMPANY.blurb}</p>
            <p className="mt-3 text-sm">
              <a href={COMPANY.contactUrl} className="font-medium text-bezel-ink underline hover:text-bezel-muted">
                Talk to an engineer
              </a>
            </p>
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
            <a href={COMPANY.toolsUrl} className="mt-4 inline-block text-sm font-medium text-bezel-ink underline hover:text-bezel-muted">
              See all Nor AI tools
            </a>
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-bezel-line pt-5 text-xs text-bezel-muted sm:flex-row sm:justify-between">
          <p className="figures">
            © {year}{" "}
            <a href={COMPANY.url} className="hover:text-bezel-ink">
              {COMPANY.name}
            </a>{" "}
            · {COMPANY.place}
          </p>
          <p>
            MIT licensed. Statistics are computed in a Web Worker in your tab;
            sign-in is optional.
          </p>
        </div>
      </div>
    </footer>
  );
}
