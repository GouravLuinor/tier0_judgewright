import { ArrowRight } from "lucide-react";
import { COMPANY } from "@/lib/site";
import { NorAiMark } from "../shell/BrandMark";

/** "Built by Nor AI": who made this tool, and the honest next step for teams that need more than the free page. */
export function BuiltBySection() {
  return (
    <section aria-labelledby="built-by-title" className="border-t border-line bg-sunk">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-14 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="max-w-2xl">
          <h2
            id="built-by-title"
            className="flex items-center gap-3 text-2xl font-semibold tracking-[-0.01em] [font-stretch:87.5%] sm:text-3xl"
          >
            <NorAiMark size={36} />
            Built by Nor AI
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            Judgewright is a free tool from {COMPANY.name}, an engineering studio in Ghazipur, Uttar Pradesh. We build
            custom AI, web and 3D software that runs in your own infrastructure, and you keep the code.
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            Need judge calibration wired into your eval pipeline, or an eval setup built around your own data? You talk
            to the engineers who write the code.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href={COMPANY.contactUrl}
            className="inline-flex h-11 items-center gap-2 rounded-[3px] bg-select px-5 text-sm font-medium text-white transition-colors duration-150 hover:bg-select-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select focus-visible:ring-offset-2"
          >
            Talk to an engineer
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <a
            href={COMPANY.aboutUrl}
            className="inline-flex h-11 items-center rounded-[3px] border border-line-strong px-5 text-sm font-medium text-ink transition-colors duration-150 hover:bg-ground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select focus-visible:ring-offset-2"
          >
            About Nor AI
          </a>
        </div>
      </div>
    </section>
  );
}
