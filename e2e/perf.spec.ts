import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * Judgewright performance + honesty journeys (A2 / A3).
 *
 * 1. A2 — the flagship 200k-row dispatch (AC-19a / AC-27 / AC-59): the report
 *    SETTLES inside a bounded wall-clock time with the tiered B in the
 *    receipt, the CIs tiered or honestly dropped — never an abort with no
 *    report. The adaptive watchdog budget is tiered by payload size, so an
 *    in-cap 200k dispatch is not killed at the small-paste wall.
 * 2. A3 — the truthful totals: for a >2,000-disagreement input the exported
 *    agreement/disagreement totals equal the TRUE counts computed from the
 *    fixture, the display window is labelled with its scope, and nothing
 *    fabricated rides along.
 */

const TOOL_URL = "/tools/judgewright";
const COMPUTE_TIMEOUT = 30_000;
/** The bound a 200k dispatch must settle inside (generous, machine-agnostic). */
const SETTLE_BOUND_MS = 60_000;

const station = (page: Page) => page.locator("#workstation");
const verdictsInput = (page: Page) => page.locator("#tool-verdicts-input");
const reportState = (page: Page) => page.locator("[data-report-state]");
const statValue = (page: Page, label: string) =>
  page.locator(`[data-stat="${label}"] dd`);

/**
 * A multi-MB fill cannot go through `locator.fill` (the value round-trips
 * through CDP once per retry). Setting the value through React's own native
 * setter and dispatching `input` commits exactly like a user paste, in one
 * round-trip; the closed poll then re-reads the committed value.
 */
async function fillStable(locator: Locator, value: string) {
  await expect(async () => {
    await locator.evaluate((element, text) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      if (!setter) throw new Error("value setter unavailable");
      setter.call(element, text);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
    await expect(locator).toHaveValue(value);
  }).toPass({ timeout: COMPUTE_TIMEOUT });
}

async function gotoReady(page: Page) {
  await page.goto(TOOL_URL, { waitUntil: "domcontentloaded" });
  await expect(verdictsInput(page)).toBeVisible({ timeout: COMPUTE_TIMEOUT });
  await expect(reportState(page)).toHaveAttribute(
    "data-report-state",
    "ready",
    { timeout: COMPUTE_TIMEOUT }
  );
}

/**
 * The flagship dispatch: 200,000 rows, ~20 MB, deliberately engineered so the
 * true disagreement total is deterministic and EXCEEDS the 2,000-row display
 * window. Every row is a disagreement here, so the honest totals are
 * 0 agreements / 200,000 disagreements and the window can only ever show
 * 2,000 of them.
 */
function flagshipFixture(rows: number): { text: string; agreements: number } {
  let agreements = 0;
  const lines: string[] = [];
  for (let i = 0; i < rows; i++) {
    const human = i % 2 === 0 ? "pos" : "neg";
    const judge = i % 2 === 0 ? "neg" : "pos";
    if (human === judge) agreements += 1;
    lines.push(
      `{"example_id":"ex-${String(i).padStart(6, "0")}","judge_label":"${judge}","human_label":"${human}"}`
    );
  }
  return { text: lines.join("\n"), agreements };
}

const ROWS = 200_000;
const FIXTURE = flagshipFixture(ROWS);
const TRUE_DISAGREEMENTS = ROWS - FIXTURE.agreements;

test.describe("Judgewright perf + honesty", () => {
  test.describe.configure({ timeout: 180_000 });

  test("A2: a 200k dispatch settles a report — never an abort", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await gotoReady(page);

    const startedAt = Date.now();
    await fillStable(verdictsInput(page), FIXTURE.text);
    await expect(reportState(page)).toHaveAttribute(
      "data-report-state",
      "ready",
      { timeout: SETTLE_BOUND_MS }
    );
    const elapsed = Date.now() - startedAt;

    // No abort verdict anywhere.
    await expect(page.locator("#report-error-message")).toHaveCount(0);
    expect(pageErrors).toEqual([]);

    // The point statistics settled over the FULL analyzed set.
    await expect(statValue(page, "lines")).toHaveText(
      ROWS.toLocaleString("en-US"),
      { timeout: COMPUTE_TIMEOUT }
    );
    await expect(station(page).locator('[data-stat="agreement"]')).toBeVisible();
    await expect(station(page).locator('[data-stat="kappa"]')).toBeVisible();

    // The report carries the tiered B — 200k rows sit on the 500-replicate
    // tier (named in the receipt, a pure function of the row count).
    await expect(page.locator("[data-receipt]")).toContainText(
      "B 500"
    );

    // CIs tiered or honestly dropped — both are a settled report.
    const ciKappa = station(page).locator('[data-stat="kappa"]');
    const dropped = await page.locator("[data-ci-dropped]").count();
    if (dropped > 0) {
      await expect(page.locator("[data-ci-dropped]")).toContainText(
        /Bootstrap CIs omitted/i
      );
      await expect(ciKappa).not.toHaveAttribute("data-ci", "kappa");
    } else {
      await expect(ciKappa).toHaveAttribute("data-ci", "kappa");
    }

    // The bound is generous but real: the flagship case settles in seconds,
    // not at the watchdog wall.
    expect(elapsed).toBeLessThan(SETTLE_BOUND_MS);

    // The disagreement table is windowed, and says so.
    await expect(page.locator("[data-disagreement-strip]")).toContainText(
      `showing 2,000 of ${ROWS.toLocaleString("en-US")} rows`
    );
  });

  test("A3: the exported totals are the TRUE counts for a >2,000-disagreement input", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await gotoReady(page);
    await fillStable(verdictsInput(page), FIXTURE.text);
    await expect(reportState(page)).toHaveAttribute(
      "data-report-state",
      "ready",
      { timeout: SETTLE_BOUND_MS }
    );

    // The in-app caption names the true totals beside the window's scope —
    // the windowed count (2,000) never masquerades as the total.
    const scope = page.locator("[data-export-scope]");
    await expect(scope).toContainText(
      `${TRUE_DISAGREEMENTS.toLocaleString("en-US")} disagreements in the full ${ROWS.toLocaleString("en-US")}-row set`
    );
    await expect(scope).toContainText(
      `${FIXTURE.agreements.toLocaleString("en-US")} agreements`
    );
    await expect(scope).toContainText(
      `within the first 2,000 shown`
    );

    // The copied markdown card carries the same true totals.
    // The report card's own button (exact: the header's is "Copy report ⌘⇧C").
    await station(page)
      .getByRole("button", { name: "Copy report", exact: true })
      .click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain(
      `Disagreements: ${TRUE_DISAGREEMENTS.toLocaleString("en-US")} of ${ROWS.toLocaleString("en-US")} rows disagree`
    );
    expect(clipboard).toContain(
      `Agreements: ${FIXTURE.agreements.toLocaleString("en-US")} of ${ROWS.toLocaleString("en-US")} rows`
    );
    expect(clipboard).toContain(
      `(showing 2,000 of ${ROWS.toLocaleString("en-US")} rows in this card; the row window caps at 2,000)`
    );
    // The receipt — recomputable from itself — carries the same full-set
    // agreement figure the window could never show (plain integers, no
    // separators, exactly as the receipt prints them).
    await expect(page.locator("[data-receipt]")).toContainText(`n = ${ROWS}`);
    await expect(page.locator("[data-receipt]")).toContainText(
      `A = ${FIXTURE.agreements}`
    );
  });
});
