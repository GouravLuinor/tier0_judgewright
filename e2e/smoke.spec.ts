import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * Judgewright smoke & journey suite (BAR §6.4).
 *
 * The scaffold ships the runnable shell: paste verdicts → Web Worker →
 * placeholder report → instant copy. These specs guard that journey end to
 * end plus the structural contract (landmarks, single <h1>, skip link,
 * persistence, ⌘K palette). No brittle DOM counts, no pixel widths:
 * web-first assertions with generous-but-bounded timeouts.
 */

const TOOL_URL = "/tools/judgewright";

/** Bounds for the off-main-thread debounce + first settle (generous). */
const COMPUTE_TIMEOUT = 15_000;
const BOUNDED_TIMEOUT = 10_000;

/** Platform-agnostic modifier for ⌘K/Ctrl+K (resolves to Control on Linux). */
const MOD = "ControlOrMeta";

// ── Stable selectors ─────────────────────────────────────────────────────────
const station = (page: Page) => page.locator("#workstation");
const verdictsInput = (page: Page) => page.locator("#tool-verdicts-input");
const reportState = (page: Page) => page.locator("[data-report-state]");
const statValue = (page: Page, label: string) =>
  page.locator(`[data-stat="${label}"] dd`);

/**
 * Controlled-React inputs only commit once the onChange → store → re-render
 * round-trip sticks. Worse, a fill that lands BEFORE React's delegated
 * listeners are attached (hydration) never reaches the store at all — the DOM
 * shows the text while the settled report still describes the previous
 * content. `waitClientReady` closes that window by requiring the client bundle
 * to have run: the pane can only read "ready" once the worker dispatch from
 * the mounted effects has settled.
 */
async function waitClientReady(page: Page) {
  await expect(page.locator("[data-report-state]")).toHaveAttribute(
    "data-report-state",
    "ready",
    { timeout: COMPUTE_TIMEOUT }
  );
}

async function fillStable(locator: Locator, value: string) {
  await expect(async () => {
    await locator.fill(value);
    await expect(locator).toHaveValue(value);
  }).toPass({ timeout: COMPUTE_TIMEOUT });
}

/** Wait until the workstation has booted and the seeded verdicts are present. */
async function waitWorkspaceReady(page: Page) {
  await expect(verdictsInput(page)).toBeVisible({ timeout: COMPUTE_TIMEOUT });
}

test.describe("Judgewright shell journeys", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TOOL_URL, { waitUntil: "domcontentloaded" });
    await waitWorkspaceReady(page);
    await waitClientReady(page);
  });

  test("landing route redirects into the workstation", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(new RegExp(`/tools/judgewright$`));
    await expect(verdictsInput(page)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("header, single h1, nav, theme toggle and sign-in are present", async ({
    page,
  }) => {
    // Exactly one <h1>, named Judgewright.
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /Judgewright/i
    );

    const header = page.getByRole("banner");
    await expect(header).toBeVisible();

    // In-page anchors to the station / guide / faq sections.
    const nav = header.getByRole("navigation");
    await expect(nav.getByRole("link", { name: /workstation/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /guide/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /faq/i })).toBeVisible();

    // Trust pills are visible on first load (BAR §2.3). They live in the
    // station header, the card's sibling above #workstation.
    for (const pill of [
      /100% in-browser/i,
      /Chance-corrected κ/i,
      /No account required/i,
    ]) {
      await expect(page.getByText(pill).first()).toBeVisible();
    }

    // Theme + auth controls (accessible names carry "theme" / "sign in").
    await expect(page.getByRole("button", { name: /theme/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("skip link targets the workstation card", async ({ page }) => {
    const skip = page.getByRole("link", { name: /skip to workstation/i });
    await expect(skip).toHaveAttribute("href", "#workstation");
    await expect(station(page)).toBeVisible();
  });

  test("seeded first run settles the placeholder report without interaction", async ({
    page,
  }) => {
    // The seeded verdicts are non-empty, and the pane settles on its own.
    await expect(verdictsInput(page)).not.toHaveValue("");
    await expect(reportState(page)).toHaveAttribute(
      "data-report-state",
      "ready",
      { timeout: COMPUTE_TIMEOUT }
    );

    // The engine badge proves the result came back through the Web Worker.
    await expect(station(page).getByText("worker", { exact: true })).toBeVisible();

    // The seeded fixture is 12 binary rows, 9 agreements / 3 disagreements.
    // Human marginals 9/3, judge marginals 8/4 ⇒ A=9, S=84, κ = (9·12−84)/(12²−84)
    // = 0.4, raw agreement 75.0%, always-majority baseline 75.0% — the Δκ
    // deflation of 0.35 (35.0 pp) is visible in the headline.
    const card = page.getByRole("region", {
      name: /calibration report card/i,
    });
    await expect(card).toBeVisible();
    await expect(card).toContainText("raw agreement");
    await expect(card).toContainText("unweighted κ");
    await expect(card).toContainText("chance baseline");
    await expect(
      card,
      "the chance baseline names its own construction"
    ).toContainText(
      "always-majority on this label distribution = 75.0%"
    );
    await expect(
      page.locator('[data-stat="agreement"] dd').first()
    ).toHaveText("75.0%");
    await expect(page.locator('[data-stat="kappa"] dd').first()).toHaveText(
      "0.40000000000000002"
    );
    await expect(page.locator('[data-stat="baseline"] dd').first()).toHaveText(
      "75.0%"
    );
    await expect(page.locator("[data-deflation]")).toContainText(
      "Δκ = 0.34999999999999998"
    );
    await expect(page.locator("[data-deflation]")).toContainText("35.0 pp");
  });

  test("worker round trip: a known JSONL fixture settles the pinned headline", async ({
    page,
    context,
  }) => {
    // The AC-10 headline fixture: 1,000 binary verdicts with a=920, b=30,
    // c=20, d=30; human marginals 940/60, judge marginals 950/50.
    const rows = [
      ...Array.from(
        { length: 920 },
        () => '{"example_id":"i","judge_label":"P","human_label":"P"}'
      ),
      ...Array.from(
        { length: 30 },
        () => '{"example_id":"i","judge_label":"P","human_label":"N"}'
      ),
      ...Array.from(
        { length: 20 },
        () => '{"example_id":"i","judge_label":"N","human_label":"P"}'
      ),
      ...Array.from(
        { length: 30 },
        () => '{"example_id":"i","judge_label":"N","human_label":"N"}'
      ),
    ].join("\n");

    await page.locator("#tool-verdicts-input").fill(rows);

    // Web-first assertions: the pane re-settles inside its own debounce tier,
    // so the assert retries until the NEW numbers land.
    await expect(reportState(page)).toHaveAttribute(
      "data-report-state",
      "ready",
      { timeout: COMPUTE_TIMEOUT }
    );
    // The badge that only renders when the result came from the Web Worker.
    await expect(page.locator('[data-engine="worker"]')).toBeVisible({
      timeout: COMPUTE_TIMEOUT,
    });

    // The report card shows the expected agreement / κ / chance baseline.
    await expect(
      page.locator('[data-stat="agreement"] dd').first()
    ).toHaveText("95.0%");
    await expect(page.locator('[data-stat="kappa"] dd').first()).toHaveText(
      "0.51923076923076927"
    );
    await expect(page.locator('[data-stat="baseline"] dd').first()).toHaveText(
      "94.0%"
    );
    await expect(page.locator("[data-deflation]")).toContainText("43.1 pp");

    // The honest paste counts still describe the whole paste.
    await expect(statValue(page, "characters")).toHaveText(
      rows.length.toLocaleString("en-US"),
      { timeout: COMPUTE_TIMEOUT }
    );
    await expect(statValue(page, "lines")).toHaveText("1,000", {
      timeout: COMPUTE_TIMEOUT,
    });

    // The receipt shows the formula inputs a reviewer can recompute from.
    const receipt = page.locator("[data-receipt]");
    await expect(receipt).toContainText("κ = (A·n − S) / (n² − S)");
    await expect(receipt).toContainText("n = 1000");
    await expect(receipt).toContainText("A = 950");
    await expect(receipt).toContainText("S = 896000");
    await expect(receipt).toContainText("A·n − S = 54000");
    await expect(receipt).toContainText("n² − S = 104000");

    // ⌘⇧C copies the one-line verdict at 17 significant digits.
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.keyboard.press(`${MOD}+Shift+C`);
    const toast = page.locator('[data-toast-variant="success"]');
    await expect(toast).toBeVisible({ timeout: BOUNDED_TIMEOUT });
    await expect(toast).toContainText(/copied/i);

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("1,000 rows");
    expect(clipboard).toContain("acc 95.0%");
    expect(clipboard).toContain("κ 0.51923076923076927");
    expect(clipboard).toContain("always-majority 94.0%");
  });
  test("rubric pane persists beside the verdicts", async ({ page }) => {
    const rubric = page.locator("#tool-rubric-input");
    await fillStable(rubric, "Accuracy, completeness, safety");

    await expect
      .poll(
        () =>
          page.evaluate(
            () => localStorage.getItem("judgewright-tool-storage") ?? ""
          ),
        { timeout: COMPUTE_TIMEOUT }
      )
      .toContain("Accuracy, completeness, safety");
  });

  test("persistence: a distinctive verdict survives a reload", async ({
    page,
  }) => {
    const distinctive =
      '{"example_id":"jw-unique-42","judge_label":"pass","human_label":"fail"}';
    await fillStable(verdictsInput(page), distinctive);

    await expect
      .poll(
        () =>
          page.evaluate(
            () => localStorage.getItem("judgewright-tool-storage") ?? ""
          ),
        { timeout: COMPUTE_TIMEOUT }
      )
      .toContain("jw-unique-42");

    await page.reload();
    await waitWorkspaceReady(page);

    await expect(verdictsInput(page)).toHaveValue(distinctive, {
      timeout: COMPUTE_TIMEOUT,
    });
  });

  test("only user content is persisted — no report or worker state leaks in", async ({
    page,
  }) => {
    await expect
      .poll(
        () =>
          page.evaluate(
            () => localStorage.getItem("judgewright-tool-storage") ?? ""
          ),
        { timeout: COMPUTE_TIMEOUT }
      )
      .toContain("verdictsText");

    const keys = await page.evaluate(() =>
      Object.keys(
        JSON.parse(localStorage.getItem("judgewright-tool-storage") ?? "{}")
          .state
      ).sort()
    );
    expect(keys).toEqual(["rubric", "settings", "verdictsText"]);

    // Toggling the theme writes its OWN key; it is never merged into the
    // content store (BAR §4.6).
    await page.getByRole("button", { name: /toggle theme/i }).click();
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Object.keys(localStorage).filter((k) => k.includes("judgewright"))
          ),
        { timeout: COMPUTE_TIMEOUT }
      )
      .toContain("judgewright-theme");

    const themeKeys = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.includes("judgewright"))
    );
    expect(themeKeys).toContain("judgewright-theme");
    expect(themeKeys).not.toContain("judgewright-tool-storage-theme");
  });

  test("command palette: Meta/Ctrl+K opens the search, Escape closes it", async ({
    page,
  }) => {
    const dialog = page.getByRole("dialog", { name: /command palette/i });

    await page.keyboard.press(`${MOD}+K`);
    await expect(dialog).toBeVisible({ timeout: COMPUTE_TIMEOUT });

    // Search field: either a textbox or the placeholder-named input.
    const search = dialog
      .getByRole("textbox")
      .or(dialog.getByPlaceholder(/type a command/i));
    await expect(search.first()).toBeVisible({ timeout: COMPUTE_TIMEOUT });
    await search.first().fill("copy");
    await expect(dialog.getByRole("option").first()).toBeVisible({
      timeout: COMPUTE_TIMEOUT,
    });

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: COMPUTE_TIMEOUT });
  });

  test("samples menu: ⌘P toggles the inline sample menu", async ({ page }) => {
    await page.keyboard.press(`${MOD}+P`);
    await expect(
      page.getByRole("menuitem", { name: /demo verdicts/i })
    ).toBeVisible({ timeout: COMPUTE_TIMEOUT });

    await page.getByRole("menuitem", { name: /demo verdicts/i }).click();
    await expect(
      page.getByRole("menuitem", { name: /demo verdicts/i })
    ).toBeHidden({ timeout: COMPUTE_TIMEOUT });
  });

  test("structure: main, header, footer landmarks and the guide/faq sections", async ({
    page,
  }) => {
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(page.locator("#matrix")).toBeVisible();
    await expect(page.locator("#guide")).toBeVisible();
    await expect(page.locator("#faq")).toBeVisible();
  });
});



/**
 * D2 — the full report card on a KNOWN fixture: the seeded κ CI, the letter
 * grade, the α panel with its mandatory disclosure, and the windowed
 * disagreement table. The fixture is the AC-10 headline (950/1000 rows agree,
 * κ 0.5192307692307692, α 0.5192400192400193), so what the pane shows can be
 * checked against the pinned references instead of re-derived.
 */
test.describe("the D2 report card — κ CI, grade, α panel, disagreements", () => {
  /** The AC-10 headline fixture as JSONL: 920 (P,P), 30 (N,P), 20 (P,N), 30 (N,N). */
  const HEADLINE = [
    ...Array.from({ length: 920 }, () => ["P", "P"] as const),
    ...Array.from({ length: 30 }, () => ["N", "P"] as const),
    ...Array.from({ length: 20 }, () => ["P", "N"] as const),
    ...Array.from({ length: 30 }, () => ["N", "N"] as const),
  ]
    .map(([human, judge], i) =>
      JSON.stringify({
        example_id: `ex-${i}`,
        judge_label: judge,
        human_label: human,
      })
    )
    .join("\n");

  test.beforeEach(async ({ page }) => {
    await page.goto(TOOL_URL, { waitUntil: "domcontentloaded" });
    await waitWorkspaceReady(page);
    await waitClientReady(page);
  });

  test("renders the κ CI, the grade, the α panel and ≥1 disagreement row", async ({
    page,
  }) => {
    await fillStable(verdictsInput(page), HEADLINE);

    const pane = page.locator('[data-report-state="ready"]');
    await expect(pane).toBeVisible({ timeout: COMPUTE_TIMEOUT });

    // Headline numbers, against the pinned references.
    await expect(pane.locator('[data-stat="agreement"]')).toContainText("95.0%");
    await expect(pane.locator('[data-stat="kappa"]')).toContainText(
      "0.5192307692307692"
    );

    // The κ CI bracket rides beside the coefficient (AC-13 / AC-52).
    const ciStat = pane.locator('[data-stat="kappa"][data-ci="kappa"]');
    await expect(ciStat).toBeVisible();
    await expect(ciStat).toContainText("95% CI");

    // The letter grade of the UNWEIGHTED κ, with its convention disclosed.
    await expect(pane.locator("[data-grade]")).toContainText("C");
    await expect(pane.locator("[data-grade]")).toContainText("moderate");
    await expect(pane.locator("[data-grade]")).toContainText(
      "Landis–Koch convention applied to unweighted κ"
    );

    // The α panel: the panel figure, the human-ceiling honesty and the
    // mandatory κ-vs-α disclosure (AC-34 / AC-50).
    const alphaPanel = pane.locator("[data-alpha-panel]");
    await expect(alphaPanel).toBeVisible();
    await expect(alphaPanel.locator("[data-alpha-panel-value]")).toContainText(
      "0.519240019240019"
    );
    await expect(alphaPanel.locator("[data-alpha-humans-value]")).toHaveText("—");
    await expect(alphaPanel).toContainText(
      "with one human rater the panel is 2 coders, so this is Krippendorff's α (a chance-corrected coefficient), not Cohen's κ; the two differ by construction"
    );

    // The disagreement table: windowed, honest about the window, and it does
    // contain the 50 rows where human and judge disagree.
    const table = pane.locator("[data-disagreement-table]");
    await expect(table).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(1000);
    await expect(table.locator('tbody tr[data-agree="false"]')).toHaveCount(50);
    await expect(table.locator("[data-disagreement-strip]")).toContainText(
      "showing 1,000 of 1,000 rows"
    );
  });

  test("⌘⇧C copies the one-line verdict with the grade and the CI bracket", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await fillStable(verdictsInput(page), HEADLINE);
    await expect(page.locator('[data-report-state="ready"]')).toBeVisible({
      timeout: COMPUTE_TIMEOUT,
    });
    // The copy must carry THIS fixture's report, not the seeded 12-row demo:
    // wait for the headline figure to settle before pressing the chord.
    await expect(
      page.locator('[data-stat="kappa"]')
    ).toContainText("0.5192307692307692", { timeout: COMPUTE_TIMEOUT });

    await page.keyboard.press(`${MOD}+Shift+KeyC`);
    await expect(page.locator('[data-toast-variant="success"]')).toBeVisible({
      timeout: BOUNDED_TIMEOUT,
    });

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("1,000 rows");
    expect(copied).toContain("acc 95.0%");
    expect(copied).toContain("κ 0.5192307692307692");
    expect(copied).toContain("always-majority 94.0%");
    // The D2 additions: the seeded CI bracket and the letter grade.
    expect(copied).toContain("grade C");
    expect(copied).toMatch(/κ 0\.5192307692307692\d* \[0\.\d+, 0\.\d+\]/);
  });

  // ── The optional opt-in BYOK LLM diagnosis (AC-17/18/38) ───────────────────
  // It is OFF by default and never automatic: the default compute fires zero
  // openrouter requests; only a configured key + a click sends exactly one.
  const diagnosisPanel = (page: import("@playwright/test").Page) =>
    page.locator('[data-testid="diagnosis-panel"]');

  test("the diagnosis is never automatic — the default compute sends no openrouter requests", async ({
    page,
  }) => {
    let hits = 0;
    await page.route("**/openrouter.ai/**", async (route) => {
      hits += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    });

    await fillStable(verdictsInput(page), HEADLINE);
    await expect(page.locator('[data-report-state="ready"]')).toBeVisible({
      timeout: COMPUTE_TIMEOUT,
    });

    // The panel is present and off — a real report settles with no BYOK call.
    await expect(diagnosisPanel(page)).toContainText("1 call, not logged");
    expect(hits).toBe(0);
  });

  test("no key ⇒ the button is a configure no-op that sends nothing (AC-17)", async ({
    page,
  }) => {
    let hits = 0;
    let authorization = "";
    await page.route("**/openrouter.ai/**", async (route) => {
      hits += 1;
      authorization = route.request().headers()["authorization"] ?? "";
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await expect(page.locator('[data-report-state="ready"]')).toBeVisible({
      timeout: COMPUTE_TIMEOUT,
    });

    const getButton = page.locator('[data-testid="diagnosis-get"]');
    await expect(getButton).toHaveText("Configure a key");
    await getButton.click();
    // No key ⇒ no request, and the panel stays in the configure-key state.
    expect(hits).toBe(0);
    await expect(getButton).toHaveText("Configure a key");
    expect(authorization).toBe("");
  });

  test("a key + click sends exactly ONE mocked call and renders the diagnosis (AC-18)", async ({
    page,
  }) => {
    const calls: { authorization: string; body: string }[] = [];
    await page.route("**/openrouter.ai/**", async (route) => {
      const request = route.request();
      calls.push({
        authorization: request.headers()["authorization"] ?? "",
        body: request.postData() ?? "",
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rubric_holes: ["No tie-breaker for near-identical answers."],
                  bias_flags: ["Favours longer answers."],
                  misapplications: ["ex-0028"],
                  priority_fix: "Add an explicit length penalty to the rubric.",
                }),
              },
            },
          ],
        }),
      });
    });

    await expect(page.locator('[data-report-state="ready"]')).toBeVisible({
      timeout: COMPUTE_TIMEOUT,
    });

    await page
      .locator('[data-testid="diagnosis-key-input"]')
      .fill("sk-or-e2e-only");
    const getButton = page.locator('[data-testid="diagnosis-get"]');
    await expect(getButton).toHaveText("Get diagnosis");
    await getButton.click();

    const result = page.locator('[data-testid="diagnosis-result"]');
    await expect(result).toBeVisible({ timeout: COMPUTE_TIMEOUT });
    await expect(result).toContainText("No tie-breaker for near-identical answers.");
    await expect(result).toContainText("Favours longer answers.");
    await expect(result).toContainText("Add an explicit length penalty to the rubric.");

    // Exactly one call, Bearer-authenticated, with the disclosed payload only.
    expect(calls).toHaveLength(1);
    expect(calls[0].authorization).toBe("Bearer sk-or-e2e-only");
    expect(calls[0].body).toContain("disagreements");

    // Nothing is persisted: a reload drops the key and the panel is unconfigured.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-report-state="ready"]')).toBeVisible({
      timeout: COMPUTE_TIMEOUT,
    });
    await expect(page.locator('[data-testid="diagnosis-get"]')).toHaveText(
      "Configure a key"
    );
  });
});
