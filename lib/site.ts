/** One source of truth for Judgewright's identity, family links and FAQ content. */

export const SITE = {
  name: "Judgewright",
  shortName: "Judgewright",
  title: "LLM Judge Calibration: Cohen's Kappa vs Human Labels",
  description:
    "Check whether your LLM-as-judge agrees with human labels once chance is removed. Paste JSONL or CSV verdicts and get Cohen's κ, Krippendorff's α, bootstrap confidence intervals, a confusion matrix and every disagreement. Free, no sign-up, computed in your browser.",
  url: "https://judge.norai.tech",
  locale: "en_US",
  creator: "Nor AI",
  keywords: [
    "LLM judge calibration",
    "LLM as a judge",
    "Cohen's kappa calculator",
    "Krippendorff's alpha calculator",
    "inter-rater reliability",
    "LLM evaluation",
    "judge human agreement",
    "confusion matrix",
    "bootstrap confidence interval",
    "Judgewright",
    "Nor AI",
  ],
  faqs: [
    {
      q: "What does Judgewright measure?",
      a: "How far you can trust an LLM judge you already run. You paste the judge's labels next to human labels for the same examples, and Judgewright reports how much of their agreement survives a chance correction (Cohen's κ and Krippendorff's α), with confidence intervals, a confusion matrix and the exact examples where they disagree. It never runs a judge and never scores a response itself.",
    },
    {
      q: "Why isn't percent agreement enough?",
      a: "Because a judge can agree with humans just by repeating the most common label. If most of your examples pass, a judge that always says pass looks excellent on raw agreement while telling you nothing. Cohen's κ subtracts the agreement expected from the label mix alone, so Judgewright shows raw agreement, the chance baseline and κ on one scale, and says how much raw agreement flatters the judge.",
    },
    {
      q: "Do my verdicts leave my browser?",
      a: "No. Parsing, every statistic and every export run in a Web Worker inside your tab. There is no upload and no account, and the page's Content Security Policy only allows connections to its own origin plus the optional sign-in provider. The repository's browser tests fail if a full analysis ever makes an outside request.",
    },
    {
      q: "How many labelled examples do I need?",
      a: "Enough for the confidence interval to be narrow enough to decide on. Judgewright prints a seeded bootstrap interval for κ; if the interval reaches zero, the data cannot rule out a judge that is no better than chance, and the verdict says so. Practitioner guides commonly suggest a frozen set of a few hundred stratified examples, but read the interval rather than a rule of thumb.",
    },
    {
      q: "What is the difference between Cohen's kappa and Krippendorff's alpha?",
      a: "Cohen's κ compares exactly two raters: your judge and the human label. Krippendorff's α treats the judge as one member of a panel, handles several human raters and missing ratings, and supports ordinal and interval data. With one human rater and nominal labels the two agree closely. When you supply several human raters, Judgewright also reports the humans-only α, the ceiling a judge cannot meaningfully exceed.",
    },
    {
      q: "Can someone else reproduce my numbers?",
      a: "Yes. The same rows, seed and replicate count produce byte-identical results. Every report carries a receipt with the formula, the inputs, the seed, the replicate count actually used and which engine computed it, so a reviewer can recompute κ from the receipt alone.",
    },
    {
      q: "Is it free? Do I need an account?",
      a: "It is free and every analysis and export works without an account. Signing in is optional and only offered when you download a report.",
    },
  ],
} as const;

/**
 * The Nor AI family thread: the same list, in the same order, on every tool.
 * Each tool renders it in its own world and leaves itself out.
 */
export const FAMILY_TOOLS = [
  { name: "TokenCraft", blurb: "Token counter and LLM cost calculator", href: "https://tokens.norai.tech" },
  { name: "SchemaCraft", blurb: "JSON to Zod, Pydantic and TypeScript types", href: "https://schema.norai.tech" },
  { name: "RegexCraft", blurb: "Regex tester with plain-English explanations", href: "https://regex.norai.tech" },
  { name: "Judgewright", blurb: "Calibrate your LLM judge against human labels", href: "https://judge.norai.tech" },
  { name: "Anchorflow", blurb: "Pin and audit GitHub Actions workflows", href: "https://anchorflow.norai.tech" },
  { name: "Smart Rozgar", blurb: "Sarkari job alerts in Hindi and English", href: "https://rozgar.norai.tech" },
] as const;

export const NORAI_URL = "https://norai.tech";
