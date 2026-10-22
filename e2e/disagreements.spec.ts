import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * AC-16 / AC-30 / AC-59 — the per-example disagreement table.
 *
 * `smoke.spec.ts` pins the table's row counts on the AC-10 headline fixture
 * and `perf.spec.ts` pins the >2,000-row window + TRUE totals. What this file
 * adds is the part neither covers: the table's PER-ROW markup (line,
 * example_id, human, judge, verdict), the "disagreements only" filter with the
 * strip's honest scope switch, and the window-vs-total distinction on a small
 * fixture where the two are equal and the strip has to say so.
 *
 * Every number asserted below is computed from the fixture in the test, never
 * copied from a previous run.
 */

const TOOL_URL = "/tools/judgewright";
const COMPUTE_TIMEOUT = 15_000;
const BOUNDED_TIMEOUT = 10_000;

const verdictsInput = (page: Page) => page.locator("#tool-verdicts-input");
const reportState = (page: Page) => page.locator("[data-report-state]");

/**
 * 20 rows, every one a JSONL row, with 4 disagreements and one row carrying a
 * SECOND human rater (the `+1` markup). The judge and human labels cycle so
 * the disagreement count is deterministic.
 */
interface Fixture {
  text: string;
  rows: number;
  disagreements: number;
}

function buildFixture(): Fixture {
  const rows: {
    exampleId: string;
    judge: string;
    human: string;
    humanLabels?: string[];
  }[] = [];
  for (let i = 0; i < 20; i++) {
    const human = i % 4 === 0 ? "fail" : "pass";
    // Every 5th row (i % 5 === 3) disagrees; the rest agree.
    const judge = i % 5 === 3 ? (human === "pass" ? "fail" : "pass") : human;
    rows.push({
      exampleId: `d-${String(i).padStart(3, "0")}`,
      judge,
      human,
      ...(i === 2 ? { humanLabels: [human, human === "pass" ? "fail" : "pass"] } : {}),
    });
  }
  const disagreements = rows.filter((row) => row.judge !== row.human).length;
  return {
    text: rows
      .map((row, index) =>
        JSON.stringify({
          example_id: row.exampleId,
          judge_label: row.judge,
          human_label: row.human,
          ...(row.humanLabels ? { human_labels: row.humanLabels } : {}),
          line: index + 1,
        })
      )
      .join("\n"),
    rows: rows.length,
    disagreements,
  };
}

const FIXTURE = buildFixture();

async function fillStable(locator: Locator, value: string) {
  await expect(async () => {
    await locator.fill(value);
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

const table = (page: Page) => page.locator("[data-disagreement-table]");
const strip = (page: Page) => page.locator("[data-disagreement-strip]");

test.describe("the disagreement table", () => {
  test.beforeEach(async ({ page }) => {
    await gotoReady(page);
    await fillStable(verdictsInput(page), FIXTURE.text);
    await expect(reportState(page)).toHaveAttribute(
      "data-report-state",
      "ready",
      { timeout: COMPUTE_TIMEOUT }
    );
  });

  test("renders one row per analyzed example with its own cells", async ({ page }) => {
    await expect(table(page).locator("tbody tr")).toHaveCount(FIXTURE.rows, {
      timeout: COMPUTE_TIMEOUT,
    });

    // The FIRST row: d-000 is line 1, human "fail", judge "fail" → agree.
    // (The fixture starts on the 4-cycle, so its first human label is "fail".)
    const first = table(page).locator("tbody tr").first();
    await expect(first).toHaveAttribute("data-agree", "true");
    await expect(first.locator("td")).toHaveCount(5);
    await expect(first).toContainText("d-000");
    await expect(first).toContainText("fail"); // human
    await expect(first).toContainText("agree");
    await expect(first).toContainText("1"); // the source line number

    // A DISAGREE row names both labels and the verdict. d-003 is the first
    // row on the 5-cycle (i % 5 === 3), human "fail" vs judge "pass".
    const disagree = table(page).locator('tbody tr[data-agree="false"]').first();
    await expect(disagree).toBeVisible();
    await expect(disagree).toContainText("DISAGREE");
    await expect(disagree).toContainText("d-003");

    // A row with a second human rater says so rather than hiding it.
    await expect(table(page)).toContainText("(+1)");
  });

  test("the flagged count equals the TRUE total computed from the fixture", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const flagged = table(page).locator('tbody tr[data-agree="false"]');
    await expect(flagged).toHaveCount(FIXTURE.disagreements, {
      timeout: COMPUTE_TIMEOUT,
    });

    // The markdown card prints the TRUE full-set totals beside the window's
    // scope, so the window's own flag count can never masquerade as the
    // total (A3) — copy it and read back what a reviewer would see.
    await page
      .getByRole("button", { name: "Copy card", exact: true })
      .click();
    const markdown = await page.evaluate(() => navigator.clipboard.readText());
    expect(markdown).toContain(
      `Disagreements: ${FIXTURE.disagreements.toLocaleString("en-US")} of ${FIXTURE.rows.toLocaleString("en-US")} rows disagree`
    );
    expect(markdown).toContain(
      `Agreements: ${(FIXTURE.rows - FIXTURE.disagreements).toLocaleString("en-US")} of ${FIXTURE.rows.toLocaleString("en-US")} rows`
    );

    // The export caption scopes the JSONL to the display window and says so
    // — here the whole set fits, and it states that instead of counting.
    await expect(page.locator("[data-export-scope]")).toContainText(
      `JSONL carries all ${FIXTURE.rows.toLocaleString("en-US")} analyzed rows`,
      { timeout: BOUNDED_TIMEOUT }
    );
  });

  test("the strip names its scope when the window holds every row", async ({
    page,
  }) => {
    // 20 rows sit far inside the 2,000-row window, so the honest statement is
    // that all of them are shown — never a bare count implying more.
    await expect(strip(page)).toContainText(
      `showing ${FIXTURE.rows.toLocaleString("en-US")} of ${FIXTURE.rows.toLocaleString("en-US")} rows`,
      { timeout: COMPUTE_TIMEOUT }
    );
    await expect(strip(page)).toContainText("the table caps at 2,000");
    // The engine-independence clause: the export and the diagnosis read the
    // SAME window the table shows, on either engine.
    await expect(strip(page)).toContainText(
      "the export and the diagnosis read this same window"
    );
  });

  test("the disagreements-only filter narrows the table and re-states the scope", async ({
    page,
  }) => {
    await expect(table(page).locator("tbody tr")).toHaveCount(FIXTURE.rows, {
      timeout: COMPUTE_TIMEOUT,
    });

    await table(page).getByRole("checkbox").check();

    // Only the disagreements remain, and the strip switches to the filtered
    // scope instead of the old sentence.
    await expect(table(page).locator("tbody tr")).toHaveCount(
      FIXTURE.disagreements
    );
    await expect(strip(page)).toContainText(
      `${FIXTURE.disagreements.toLocaleString("en-US")} of ${FIXTURE.disagreements.toLocaleString("en-US")} shown disagreements in this window`
    );
    // Every visible row is a disagreement.
    const rows = table(page).locator("tbody tr");
    for (let i = 0; i < FIXTURE.disagreements; i++) {
      await expect(rows.nth(i)).toHaveAttribute("data-agree", "false");
    }

    // Unchecking restores every row.
    await table(page).getByRole("checkbox").uncheck();
    await expect(table(page).locator("tbody tr")).toHaveCount(FIXTURE.rows);
  });

  test("the window never masquerades as the total (AC-59)", async ({ page }) => {
    // The strip's total is the report's n, and the report's meta strip states
    // that n beside the window's own row count.
    const card = page.locator("#report-pane");
    await expect(card).toContainText(
      `n = ${FIXTURE.rows.toLocaleString("en-US")} rows`,
      { timeout: COMPUTE_TIMEOUT }
    );
    await expect(strip(page)).toContainText(
      `of ${FIXTURE.rows.toLocaleString("en-US")} rows`
    );

    // The exported JSONL is window-scoped and SAYS so: 20 rows is inside the
    // window, so the copy carries the whole set and the caption says so.
    const scope = await page.locator("[data-export-scope]").textContent();
    expect(scope).toContain("JSONL carries all 20 analyzed rows");
  });
});
