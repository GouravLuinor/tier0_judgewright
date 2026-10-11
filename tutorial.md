# Judgewright tutorial

Everything you need to get a calibration report from a set of verdicts. The tool never asks for
an account and never sends your verdicts anywhere.

## 1. Paste your verdicts

The left pane takes **JSONL** (one JSON object per line) or **CSV** (header row auto-detected).
Only three slots are required — an id, what the judge said, what the humans said:

```json
{"example_id":"ex-001","judge_label":"pass","human_label":"pass"}
{"example_id":"ex-002","judge_label":"fail","human_label":"pass"}
```

Column aliases are mapped automatically, so a verdict set from any pipeline usually pastes
cleanly. Optional fields — `judge_critique`, `human_critique`, `judge_score`, and
`human_labels` (two or more raters unlocks the human-ceiling α) — only add panels.

If you just want to look around, press **⌘P** (or use *Samples → Demo verdicts*) and the
workstation seeds twelve hand-checkable rows.

## 2. Add the rubric (optional)

The rubric pane takes up to 8,000 characters and is what the optional diagnosis reads. Parsing
and every statistic work without it.

## 3. Read the report

The right pane settles the real report: confusion matrix, chance-corrected agreement, the
agreement-to-κ deflation, Krippendorff's α, the seeded bootstrap CIs and the letter grade,
each with its reproducibility receipt. Above it the station names what the whole paste
contains (characters, words, bytes, lines), which is honest about the whole paste even when
the report only covers the valid rows.

Every figure names the engine that produced it. If the worker is unavailable the amber banner
says so and the same core runs on the main thread — the numbers are identical, only the live
budget is capped.

## 4. Copy anything

- **⌘⇧C** copies the analyzed paste; a lime toast confirms and a rose toast reports failure.
- The per-pane **Copy** buttons do the same without the keyboard.

## 5. Keyboard reference

| Chord | Action |
|---|---|
| `⌘K` / `⌃K` | Command palette (navigate, load a sample, toggle theme, clear, sign in) |
| `⌘P` / `⌃P` | Samples menu |
| `⌘⇧C` / `⌃⇧C` | Copy the analyzed paste |
| `⌘↵` / `⌃↵` | Focus the verdicts field |

## 6. Reproduce it yourself

Statistics are deterministic: same rows, same seed, same replicate count ⇒ byte-identical
output. The seed and the confidence level live in your persisted settings, so a report you
receive from a colleague lands on the same numbers when you paste the same rows.

## 7. Where your data goes

Nowhere. Parsing, statistics and export all run in a Web Worker in this tab. There is no
upload, no telemetry on your payload, and no account requirement. The auto-diagnosis flow is off
by default and is only ever armed by a key you paste yourself.

## Troubleshooting

- **The pane shows "main-thread" instead of "worker"** — your browser or an extension blocked
  the worker. The numbers are the same; only the live budget is capped.
- **Nothing appears to happen when you paste** — the adaptive debounce is holding a burst
  (up to 250ms pasted for very large inputs) so a long paste collapses into one report.
- **A rose card appeared** — a capacity error. The true size of your input is stated, and
  nothing was parsed.
- **Numbers look stale after clearing** — they are not: a clear settles a zeroed report rather
  than keeping the previous counts.
