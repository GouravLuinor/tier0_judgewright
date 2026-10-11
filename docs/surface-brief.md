# Judgewright — surface brief (direction contract)

The *direction* contract. `docs/DESIGN.md` is how it was built; this is what it is for.

**THESIS.** A calibration instrument you would trust with an eval decision. The page is a lab
bench, not a landing page: it earns trust by showing its arithmetic, naming its budget, and
refusing to send anything anywhere. The user is an applied ML engineer or eval lead who has
already shipped a judge and is now deciding whether to trust it — someone who will
recompute a number if given the chance, and distrust the tool if they cannot.

**OWN-WORLD.** Being measurable. Competitor gloss would be a markdown-in-a-template; here the
*geometry of measurement* is the visual world — the confusion matrix is the one hero diagram,
and every surface around it is the bench it sits on. Where an "AI startup" template would show
neon gradients, dashboard sparklines and a hero video, Judgewright shows a hairline-ruled
workstation where the only color is the settled measurement.

**STORY.** Paste verdicts → the worker settles → the report card reads out in error bars. The
page opens mid-task (the verdicts field already seeded, an inline tooltip stating the paste
ceiling) so the tool is *used* before it is *read*: scroll down and the matrix bars explain why
chance-corrected agreement matters; the guide teaches the arithmetic; the FAQ names the budget
every number ran under.

**FIRST VIEWPORT.** A branded sticky header over the 24rem-wide workstation card, `pt-4 md:pt-5`
top padding. The `h1` "Judgewright" and its tagline sit at the top-left beside live trust pills
(one lime "100% in-browser", two neutral); the verdicts field opens on the left, the report on
the right, and the status strip is visible with no scroll. The scroll indicator badge is
deliberately vertical (`Flex-col-reverse`) so it never clashes with the panses. The design
promise in one glance is: this is a tool, not a brochure.

**FORM.** Massive typographic contrast: a small-but-bold `text-xl sm:text-2xl` mono/sans hybrid
`h1` beside a 24rem primary card, and long-form `text-sm leading-relaxed` body copy beside
11px mono captions. Flat bento discipline for the comparison and guide sections — hairline
borders, no gradient, no emoji. Mono is the voice of the machine, sans is the voice of the
tool. Type hierarchy is carried by size, weight and tracking, never by color.

**MOOD.** Calm, exact, fast, quiet. It looks like something that ran overnight without waking
anyone up. The only warmth is the lime measurement — a single, restrained, confident signal.

**CONTENT & COPY.** First person plural, plain language, no buzzwords, no triumphant verbs.
Buttons are single verbs ("Compute", "Copy report", "Export"). Every number the page claims is
cited and marked "cited, not computed by this tool" — the education copy stays digit-free prose
plus formulas, which `_lib/__tests__/content.test.ts` guards. The status
strip is honest about phase, rows analyzed, characters and elapsed ms, and the receipt names
the seed, replicate count, budget and engine.

**OUT OF SCOPE.** Particle systems, 3D, parallax, scroll-jacking, hero video, gradient text,
emoji, "10x faster" claims, fake dashboards, and any animation longer than 300ms.
