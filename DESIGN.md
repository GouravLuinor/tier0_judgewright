---
name: Judgewright
description: Calibrate an LLM judge against human labels, read off a reference chart.
colors:
  ground: "rgb(234 234 231)"
  panel: "rgb(248 248 246)"
  sunk: "rgb(238 238 235)"
  line: "rgb(206 206 201)"
  line-strong: "rgb(160 160 155)"
  ink: "rgb(26 26 25)"
  ink-2: "rgb(66 66 64)"
  ink-3: "rgb(92 92 89)"
  bezel: "rgb(30 30 29)"
  bezel-raised: "rgb(44 44 42)"
  bezel-line: "rgb(64 64 61)"
  bezel-ink: "rgb(240 240 236)"
  bezel-muted: "rgb(178 178 172)"
  agree: "rgb(103 189 170)"
  agree-ink: "rgb(20 104 87)"
  miss: "rgb(193 90 99)"
  miss-ink: "rgb(158 38 52)"
  caution: "rgb(224 163 46)"
  caution-ink: "rgb(128 80 0)"
  select: "rgb(80 91 166)"
  select-ink: "rgb(62 72 150)"
  wedge-0: "rgb(52 52 52)"
  wedge-1: "rgb(85 85 85)"
  wedge-2: "rgb(110 110 109)"
  wedge-3: "rgb(160 160 160)"
  wedge-4: "rgb(200 200 200)"
  wedge-5: "rgb(243 243 242)"
  label-0: "rgb(98 122 157)"
  label-1: "rgb(214 126 44)"
  label-2: "rgb(94 60 108)"
  label-3: "rgb(157 188 64)"
  label-4: "rgb(8 133 161)"
  label-5: "rgb(187 86 149)"
  label-6: "rgb(87 108 67)"
  label-7: "rgb(194 150 130)"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  heading:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.625
  figure:
    fontFamily: "Fragment Mono, ui-monospace, monospace"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.2
  data:
    fontFamily: "Fragment Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  patch: "2px"
  control: "3px"
spacing:
  gutter-mobile: "16px"
  gutter-tablet: "24px"
  gutter-desktop: "32px"
  section-mobile: "48px"
  section-desktop: "80px"
components:
  button-primary:
    backgroundColor: "{colors.select}"
    textColor: "{colors.panel}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 16px"
  button-outline:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 12px"
  bezel-header:
    backgroundColor: "{colors.bezel}"
    textColor: "{colors.bezel-ink}"
    height: "56px"
  report-frame:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.control}"
  patch:
    rounded: "{rounded.patch}"
    size: "8px"
---

# Judgewright design system: Reference Target

## Overview

The judge is an instrument being calibrated against a reference chart, and the
page reads the result off that chart. The world borrows from a ColorChecker
test target: a matte charcoal bezel frames the header and the report in both
themes, the ground is a neutral grey card (light) or the chart's black (dark),
and every state colour is a patch with exactly one job.

The page is Operate first: the first viewport is the workstation, with
verdicts in on the left (36%) and the answer on the right (64%). Below a
settled report come the disagreements, the other readings ("Beyond κ") and
the exports. The landing sections follow (How it compares, Method, FAQ), then
the Nor AI family footer.

Signature: the confusion matrix is printed as a calibration target of split
patches. The top-left triangle is the human label and the bottom-right is the
judge. Diagonal cells are solid, and off-diagonal cells are the judge's errors.
Clicking one filters the disagreement table to those rows.

## Colors

Tokens are space-separated RGB triplets in `app/globals.css` (`:root` light,
`.dark` dark) so Tailwind `/opacity` modifiers work. Tailwind exposes them by
name (`bg-panel`, `text-ink-2`, `bg-agree`). No default Tailwind palette class
and no hex literal is used outside the token blocks.

- **Neutrals:** ground, panel, sunk, line, line-strong and ink / ink-2 / ink-3.
  All three ink steps clear 4.5:1 on panel and ground in both themes.
- **Bezel:** the charcoal frame (bezel, bezel-raised, bezel-line, bezel-ink,
  bezel-muted). It stays dark in both themes.
- **State patches, one job each:**
  - `agree` (bluish green): the judge matched the human.
  - `miss` (moderate red): the judge and the human disagree.
  - `caution` (orange yellow): a limit or a weak signal (degraded engine,
    dropped CI, missing columns).
  - `select` (purplish blue): the primary action, focus and selection.

  The bare name is the fill; `*-ink` is the text-safe shade.
- **Step wedge:** `wedge-0…5`, the six neutral patches. Their only job is the
  agreement bands on the −1…1 scale.
- **Label identity:** `label-0…7`, the ColorChecker patches that carry no state.
  They identify label classes in the matrix. Blue sky and orange lead, so a
  binary set is the most separable pair, colour-blind included.

Dark theme: the ground is 18 18 17 and the panel 27 27 26. Patch fills keep
their hue, the `*-ink` shades lighten, and select lifts to 120 131 214.

## Typography

- **Archivo** (variable, with the width axis) is used for all UI and prose.
  Headings narrow with `font-stretch: 85–87.5%` and carry slight negative
  tracking.
  - H1 (one per page): 1.75rem on phones, 2.25rem at sm and 2.75rem at lg,
    weight 600.
  - Section H2s: 1.5rem, or 1.875rem at sm.
  - Body: 15–17px with relaxed leading. Prose is capped at about 60ch.
- **Fragment Mono** is for machine data only: verdict rows, the receipt,
  figures, keycaps and the meta strip.
- `.figures` applies tabular, lining numerals wherever one figure is compared
  with another.
- On screen, figures show 2 decimals (`coef`). The exact 17-significant-figure
  value sits in `data-value` and `title`, which is the same string the exports
  print.

## Layout

- `<main>` is full width with `overflow-x-hidden`. Each section is
  `mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8`, which gives 16px gutters on
  phones.
- The workstation is `lg:grid-cols-[36fr_64fr]` and stacks below lg.
- Sections are separated by a 1px `border-t border-line`, never by cards.
- On phones, "Beyond κ" and "Share" fold to their heading (a button with
  `aria-expanded`), and the comparison table becomes one `<details>` per
  criterion. The 390px page stays at about 6,300px with no horizontal scroll.
- The disagreement inspector is a sticky left column (matrix plus focused
  example) beside a scrollable table capped at 22rem (34rem at lg).

## Elevation & Depth

There is one depth. `shadow-lift` raises the report frame a hair off the grey
card, and `shadow-pop` is used only for overlays (dropdowns, the command
palette, dialogs). There is no glass, no blur and no gradient surface. The
only gradient is the hard 50/50 split inside a split patch.

## Shapes

- Controls, panels and overlays use a 3px radius (`rounded-[3px]`).
- Patches use a 2px radius (`.patch`), square on purpose.
- Rules are 1px. Never use a coloured left border thicker than 1px.

## Components

- **Bezel header:** charcoal in both themes. It holds the wordmark, section
  nav (Calibrate, Method, Compare, FAQ; hidden below md), Samples (⌘P on the
  panel copy), ⌘K, the theme toggle and a quiet Sign in.
- **Report pane** (`#report-pane`, `data-report-state`): a bezel meta strip
  (n, format, engine, ms, Copy verdict ⌘⇧C) above a readVerdict headline
  sentence. Below the headline come:
  - the AgreementScale: one −1…1 wedge showing κ, its CI bracket, the
    dashed chance line at 0 and a raw-agreement tick;
  - the Figures (raw agreement, κ, chance baseline);
  - the grade and the Δκ sentence;
  - the PopulationStrip, with one mark per row;
  - the next-step CTA.
- **Target matrix:** split patches; clicking a cell sets the table filter.
- **Disagreement table:** five columns, rows tagged `data-agree`. Focusing a
  row dims the others.
- **Signals:** spec-sheet rows (term and meaning on the left, reading on the
  right) for α, weighted κ, calibration, bias and per-label metrics. Each row
  says what it needs when the file lacks it.
- **Buttons:**
  - `default`: select fill, white text (bezel-dark text in dark mode). Use one
    per region.
  - `outline`: panel fill with a line border.
  - `ghost`.
  - Hover changes colour only. Active nudges 1px down. Focus shows a 2px
    select ring with a 2px offset.
- **Toasts:** `data-toast-variant` success or error. Both auto-dismiss.

Motion: `ease-out-expo` (`cubic-bezier(0.16, 1, 0.3, 1)`) with 150ms colour
transitions. The one authored animation is `marker-settle` (420ms): the κ
marker slides to its value. A global `prefers-reduced-motion` rule zeroes all
motion.

## Do's and Don'ts

- Do give every colour a job. A patch colour on decoration is a lie about
  the data.
- Do put the plain-sentence verdict before any number.
- Do keep exact values in `data-value` and the exports, and show 2 decimals.
- Do theme the browser surfaces: selection, caret, scrollbars and focus ring.
- Don't use eyebrows above headings, 01/02 section numbers, hero-metric tiles
  or grids of same-size icon cards.
- Don't use gradient text, glass, blur, emoji used as icons or a coloured
  border-left thicker than 1px.
- Don't make claims the code doesn't back. The comparison names categories,
  not products, and says where they are stronger.
