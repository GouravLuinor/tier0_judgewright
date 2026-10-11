/** KnowledgeHub content — ONE source array renders the guide tabs. */

export interface GuideTab {
  id: string;
  label: string;
  title: string;
  blurb: string;
  code: string;
}

export const GUIDE_TABS: GuideTab[] = [
  {
    id: "verdicts",
    label: "Verdict shape",
    title: "The verdict row Judgewright reads",
    blurb:
      "One JSON object per example, one example per line. Only three fields are required: an id, what the judge said, and what the humans said. Everything else — critiques, scores, extra raters — is optional and only unlocks more of the report.",
    code: `{"example_id":"ex-001",
 "judge_label":"pass",          // what your judge emitted
 "human_label":"pass",          // what the human(s) said
 "judge_critique":"optional",   // shown side-by-side in the table
 "human_critique":"optional",
 "judge_score":0.93,            // optional, in [0,1]
 "human_labels":["pass","pass"] // optional: ≥2 raters unlock the human ceiling`,
  },
  {
    id: "csv",
    label: "CSV",
    title: "The same rows as CSV",
    blurb:
      "CSV is accepted with the identical semantics: quoted fields may contain commas and newlines, CRLF endings are fine, and the header row is auto-detected by alias. The report is byte-identical whichever form the same logical rows arrive in.",
    code: `example_id,judge_label,human_label,judge_score
ex-001,pass,pass,0.93
ex-002,pass,fail,0.61
ex-003,fail,fail,0.12`,
  },
  {
    id: "columns",
    label: "Column aliases",
    title: "Your column names, mapped automatically",
    blurb:
      "Exporters disagree about naming. Judgewright maps a documented alias table onto the internal slots, so a verdict set from any pipeline pastes cleanly. If two distinct columns claim the same slot, that is a hard error rather than a silent guess.",
    code: `example_id    ← id · example · uid
judge_label   ← judge · verdict · prediction · predicted_label
human_label   ← human · gold_label · label · reference_label · expected
judge_score   ← judge_confidence · confidence · score · probability
judge_critique← judge_reason · judge_rationale · reason
human_critique← human_reason · human_rationale · note`,
  },
  {
    id: "reliability",
    label: "Reliability",
    title: "Agreement is not chance-corrected agreement",
    blurb:
      "Raw agreement counts every tie, including the ties a coin flip would have produced. A chance-corrected coefficient subtracts the agreement expected from the label distribution alone, which is why a judge can score high accuracy against a skewed label set and still be nearly worthless. Judgewright prints both numbers side by side, plus the deflation between them, so the gap is impossible to miss.",
    code: `raw agreement   = agreeing rows / total rows
chance expected = Σ (human share × judge share)   // per label
kappa           = 1 − (1 − agreement) / (1 − chance expected)
deflation       = raw agreement − kappa           // the headline gap`,
  },
  {
    id: "repro",
    label: "Reproducibility",
    title: "Every number carries its own receipt",
    blurb:
      "The statistics are deterministic on purpose: the same rows, the same seed and the same replicate count produce byte-identical intervals. Judgewright prints the exact seed, the replicate count that was actually used, the budget it ran under, and which engine produced the number — so a skeptic can recompute it from the paste alone.",
    code: `seed            = fixed, user-visible, persisted with your settings
replicates (B)   = tiered by row count — never wall-clock adaptive
budget           = worker 1000ms · main-thread 800ms (disclosed when it trips)
engine           = worker · main-thread`,
  },
];
