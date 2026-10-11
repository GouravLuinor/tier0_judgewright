/** One source of truth for Judgewright's identity and FAQ content. */

export const SITE = {
  name: "Judgewright",
  shortName: "Judgewright",
  title: "Judgewright — Calibration Instrument for the LLM Judge You Already Ship",
  description:
    "Paste a rubric and a set of verdicts; Judgewright returns a report card with error bars — confusion matrix, chance-corrected agreement, Krippendorff's α, seeded reproducible bootstrap CIs and a letter grade. 100% in-browser, no account required.",
  url: "https://judge.norai.tech",
  locale: "en_US",
  creator: "Nor AI",
  keywords: [
    "Judgewright",
    "LLM judge calibration",
    "Cohen's kappa",
    "Krippendorff alpha",
    "inter-rater reliability",
    "LLM evaluation",
    "confusion matrix",
    "chance-corrected agreement",
    "bootstrap confidence interval",
    "offline judge evaluation",
    "zero cloud egress developer tool",
    "Nor AI",
  ],
  faqs: [
    {
      q: "What does Judgewright actually measure?",
      a: "It measures a judge you already have labels for. You paste verdicts alongside human labels, and Judgewright reports how much of the agreement between them survives a chance correction, with error bars and a reproducibility receipt. It never runs a judge itself, never ranks an answer, and never scores a response.",
    },
    {
      q: "Do my verdicts leave my browser?",
      a: "No. Parsing, every statistic and each export are computed inside an in-browser Web Worker. There is no upload, no telemetry on your payload, and no account requirement. The default path makes zero network requests — the Playwright request guard in this repository fails CI if that ever changes.",
    },
    {
      q: "Why is agreement not the headline?",
      a: "Raw agreement counts ties that a coin flip would also have produced once you account for the label distribution, so a judge can look excellent against a skewed label set while carrying almost no information. Judgewright prints raw agreement, the chance-corrected coefficient, and the deflation between them side by side, so the gap cannot be missed.",
    },
    {
      q: "Can I reproduce the numbers myself?",
      a: "Yes. Statistics are deterministic: the same rows, the same seed and the same replicate count produce byte-identical results. The receipt prints the exact seed, the replicate count that was actually used, the budget it ran under, and which engine produced the number.",
    },
    {
      q: "What happens on a very large verdict set?",
      a: "The whole pipeline runs off the main thread behind an adaptive debounce, a cooperative deadline and a hard watchdog, so the interface stays responsive. Rows above the cap are capped before analysis while the true total is still counted and shown, and any budget that trips is disclosed rather than silently absorbed.",
    },
    {
      q: "Does it work without an account?",
      a: "Completely. Sign-in, when a project is configured, only unlocks conveniences such as cross-device sync. Every deterministic feature — parsing, statistics, tables, exports, copying — works with no account and no backend at all.",
    },
  ],
} as const;
