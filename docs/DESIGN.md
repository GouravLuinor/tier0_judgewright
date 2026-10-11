# Matchlight — the design system as shipped

The token ladder below is `app/globals.css`; the machine-readable mirror is
[`design_tokens.json`](../design_tokens.json). Nothing here is aspirational — every value is
in use.

## The thesis

Developer trust in a measurement tool is visual before it is logical. The page should read like
an instrument in a lab — flat, hairline-ruled, monospaced where it reports and sans where it
speaks — never like a marketing surface that happens to compute. One accent marks the only
thing that matters: the settled measurement.

## The palette

### Surface ladder

Semantic tokens are space-separated RGB triplets so Tailwind's `/opacity` modifiers keep
working. `:root` is light, `.dark` overrides the same names.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--canvas` | `250 250 247` | `12 14 11` | Page |
| `--ink` | `24 26 22` | `236 238 228` | Primary text |
| `--surface-base` | `252 252 250` | `14 16 13` | Panes |
| `--surface-subtle` | `240 241 235` | `23 26 21` | Striped rows, badges |
| `--surface-default` | `255 255 255` | `23 26 21` | Cards, menus |
| `--surface-elevated` | `240 241 235` | `35 39 31` | Hover, active |
| `--surface-border` | `229 231 221` | `46 51 40` | The 1px hairline |

### The one accent, and semantic state colors

| Token | Light | Dark | Worn by |
|---|---|---|---|
| `brand-lime` | `77 124 15` | `190 242 100` | settled measurement, primary action, focus/active ring, plane separation |
| `brand-amber` | `180 83 9` | `252 228 130` | warning only — degraded banner, capped output |
| `brand-rose` | `190 18 60` | `253 164 175` | error only — rejection card, failure toast |
| `brand-violet` | `109 40 217` | `167 139 250` | promotion/deprecation callouts, citation links |

Lime is absent from every headline, most icons, and all body text. It marks *measurement* and
*control state*, which is why it is instantly legible.

### Neutrals

The inverted zinc scale is the only permitted neutral outside the ladder. The same variable
name flips with the theme: `:root` defines dark-on-light, `.dark` overrides to
light-on-dark.

`text-zinc-100` headings · `-300` secondary · `-400` muted labels · `-500` faint mono
captions.

## Type

Inter for prose, JetBrains Mono for anything the machine produced. Mono is **only** for
verdicts, code, statistics, dates, keyboard chords, badges and captions — never for a headline.
Subheadings are `text-2xl sm:text-3xl font-semibold tracking-tight`.

## Form

- `rounded-2xl` is the hard ceiling for the largest surface (the workstation card). Everything
  else is `rounded-lg` / `rounded-xl` / `rounded-md`.
- `shadow-raycast` = inset 1px light hairline + a whisper of lift.
  `shadow-elevated` = one large lift. No glow, no colored shadow, no depth theatre.
- Blur is `backdrop-blur-[6px]` on the header only. `.glass-edge` is a **machined edge**, not
  frosted glass: a symmetric 1px shadow on both edges of a scrolling 2-pane grid with different
  backgrounds, so the seam reads as a machined joint.
- Selection is `--brand-lime` at 25% — the accent is never decorative.

## Motion

`ease-out-expo` (`cubic-bezier(0.16, 1, 0.3, 1)`) is the only curve, durations are 150/180/300ms,
and only compositor-friendly properties move (`transform`, `opacity`, `background-color`,
`border-color`, `color`). No opacity-only fades on interactive elements. There is no animation
runtime in the dependency tree at all: toasts and menus use CSS transitions that follow the same
curve, which is also what keeps First Load JS inside budget. `prefers-reduced-motion: reduce`
zeroes every transition and animation globally.

## Interaction states — five, everywhere

| State | Implementation |
|---|---|
| default | token classes, no inline style |
| hover | a visibly distinct border (`surface-borderHover`) and surface step |
| focus-visible | 2px `brand-lime` ring at 70% + 2px canvas offset, keyboard-only |
| active | `scale-[0.97]`, matching the 150ms out-expo |
| disabled | `opacity-50`, `cursor-not-allowed`, no pointer events |

`hover:` without `focus-visible:` is a defect; so is a focus ring that shows on mouse click.

## Component rules

- The command palette and modals are portalled to `<body>`; e2e queries them at page level,
  never inside the workstation card.
- The two-pane grid is `lg:h-[620px] lg:grid-cols-2` with both panes `h-full min-h-0` so the
  scroll container is always the pane, never the page.
- The status strip is always machine-monospaced: state · rows · chars · ms.
