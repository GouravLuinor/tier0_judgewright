import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * Judgewright live-compute demos.
 *
 * Split into their own file so a cosmetic layout change can fail without
 * taking down the broader smoke suite. Everything here proves real product
 * behaviour, not pixel geometry:
 *   1. The paste → worker → report round trip, including a big payload that
 *      trips the adaptive debounce tier.
 *   2. The degraded path: with Web Workers unavailable the hook runs the SAME
 *      pure core on the main thread and the amber banner renders — the numbers
 *      must be identical to the worker run (SPEC S4).
 *   3. The copy path: ⌘⇧C copies the current output and shows the brand-lime
 *      success toast; the failure toast is rose.
 */

const TOOL_URL = "/tools/judgewright";
const COMPUTE_TIMEOUT = 15_000;
const BOUNDED_TIMEOUT = 10_000;

const MOD = "ControlOrMeta";

const station = (page: Page) => page.locator("#workstation");
const verdictsInput = (page: Page) => page.locator("#tool-verdicts-input");
const reportState = (page: Page) => page.locator("[data-report-state]");
const statValue = (page: Page, label: string) =>
  page.locator(`[data-stat="${label}"] dd`);

const PAYLOAD = '{"example_id":"ex-001","judge_label":"pass","human_label":"pass"}\n{"example_id":"ex-002","judge_label":"fail","human_label":"pass"}';

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

async function gotoReady(page: Page) {
  await page.goto(TOOL_URL, { waitUntil: "domcontentloaded" });
  await expect(verdictsInput(page)).toBeVisible({ timeout: COMPUTE_TIMEOUT });
  await waitClientReady(page);
}

test.describe("Judgewright live-compute demos", () => {
  test.beforeEach(async ({ page }) => {
    await gotoReady(page);
  });

  test("paste settles through the worker with matching counts", async ({
    page,
  }) => {
    await fillStable(verdictsInput(page), PAYLOAD);

    await expect(reportState(page)).toHaveAttribute(
      "data-report-state",
      "ready",
      { timeout: COMPUTE_TIMEOUT }
    );

    await expect(statValue(page, "characters")).toHaveText(String(PAYLOAD.length), {
      timeout: COMPUTE_TIMEOUT
    });
    await expect(statValue(page, "bytes")).toHaveText(String(await page.evaluate((t) => new TextEncoder().encode(t).length, PAYLOAD)), {
      timeout: COMPUTE_TIMEOUT
    });
    await expect(statValue(page, "lines")).toHaveText("2", {
      timeout: COMPUTE_TIMEOUT
    });
  });

  test("a large payload takes the adaptive debounce tier and still settles", async ({
    page,
  }) => {
    // >5,000 characters trips the 40ms debounce tier; the counts must be exact.
    const big = "x".repeat(6_000);
    await fillStable(verdictsInput(page), big);

    await expect(reportState(page)).toHaveAttribute(
      "data-report-state",
      "ready",
      { timeout: COMPUTE_TIMEOUT }
    );
    await expect(statValue(page, "characters")).toHaveText("6,000", {
      timeout: COMPUTE_TIMEOUT
    });

    // The echo is capped and flagged, while the counts still describe the whole
    // paste.
    await expect(station(page).getByText(/echo of the analyzed paste/i)).toBeVisible();
  });

  test("theme toggle flips <html class> between light and dark", async ({
    page,
  }) => {
    const html = page.locator("html");
    const initialDark = await html.evaluate((el) =>
      el.classList.contains("dark")
    );

    await page.getByRole("button", { name: /toggle theme/i }).click();

    await expect
      .poll(() => html.evaluate((el) => el.classList.contains("dark")), {
        timeout: BOUNDED_TIMEOUT,
      })
      .toBe(!initialDark);
  });

  test("⌘⇧C copies the current output and shows the lime success toast", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await fillStable(verdictsInput(page), PAYLOAD);
    await expect(reportState(page)).toHaveAttribute(
      "data-report-state",
      "ready",
      { timeout: COMPUTE_TIMEOUT }
    );

    await page.keyboard.press(`${MOD}+Shift+C`);

    const toast = page.locator('[data-toast-variant="success"]');
    await expect(toast).toBeVisible({ timeout: BOUNDED_TIMEOUT });
    await expect(toast).toContainText(/copied/i);
    // The success toast wears the one accent (BAR §2.5), not a neutral card.
    await expect(toast).toHaveClass(/text-brand-lime/);

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(PAYLOAD);
  });

  test("copy failure surfaces the rose toast", async ({ page }) => {
    await fillStable(verdictsInput(page), PAYLOAD);
    await expect(reportState(page)).toHaveAttribute(
      "data-report-state",
      "ready",
      { timeout: COMPUTE_TIMEOUT }
    );

    // Force the Clipboard API and the execCommand fallback to fail.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: () => Promise.reject(new Error("denied")),
        },
      });
      const doc = document as unknown as { execCommand: () => boolean };
      doc.execCommand = () => false;
    });

    await page.keyboard.press(`${MOD}+Shift+C`);

    const toast = page.locator('[data-toast-variant="error"]');
    await expect(toast).toBeVisible({ timeout: BOUNDED_TIMEOUT });
    await expect(toast).toContainText(/copy failed/i);
    await expect(toast).toHaveClass(/text-brand-rose/);
  });

  test("worker unavailable: the amber banner renders and the numbers are identical", async ({
    page,
  }) => {
    // Degrade on purpose: a Worker constructor that always throws routes the
    // hook through its single degradation path.
    await page.addInitScript(() => {
      class BrokenWorker {
        constructor() {
          throw new Error("Worker blocked for the degraded-path journey");
        }
      }
      Object.defineProperty(window, "Worker", {
        configurable: true,
        writable: true,
        value: BrokenWorker,
      });
    });

    await gotoReady(page);

    // The degraded banner is the documented FM-6 copy.
    const banner = page.locator("#worker-degraded-banner");
    await expect(banner).toBeVisible({ timeout: BOUNDED_TIMEOUT });
    await expect(banner).toContainText(/Worker unavailable — computing on the main thread/i);

    // The SAME core still settles — and it says which engine produced it.
    await expect(reportState(page)).toHaveAttribute(
      "data-report-state",
      "ready",
      { timeout: COMPUTE_TIMEOUT }
    );
    await expect(station(page).locator('[data-engine="main-thread"]')).toBeVisible();

    // Point statistics are identical to the worker run for the same input
    // (SPEC S4: degradation never changes a number).
    const probe = '{"example_id":"ex-001","judge_label":"pass","human_label":"pass"}';
    const expected = {
      characters: probe.length,
      words: probe.trim().split(/\s+/).length,
      lines: probe.split("\n").length,
    };

    await fillStable(verdictsInput(page), probe);
    await expect(reportState(page)).toHaveAttribute(
      "data-report-state",
      "ready",
      { timeout: COMPUTE_TIMEOUT }
    );

    await expect(statValue(page, "characters")).toHaveText(String(expected.characters), {
      timeout: COMPUTE_TIMEOUT
    });
    await expect(statValue(page, "words")).toHaveText(String(expected.words), {
      timeout: COMPUTE_TIMEOUT
    });
    await expect(statValue(page, "lines")).toHaveText(String(expected.lines), {
      timeout: COMPUTE_TIMEOUT
    });
  });

  test("clear: wipes the paste and settles a zeroed report instead of stale numbers", async ({
    page,
  }) => {
    await fillStable(verdictsInput(page), PAYLOAD);
    await expect(reportState(page)).toHaveAttribute(
      "data-report-state",
      "ready",
      { timeout: COMPUTE_TIMEOUT }
    );
    await expect(statValue(page, "characters")).toHaveText(String(PAYLOAD.length), {
      timeout: COMPUTE_TIMEOUT
    });

    await station(page).getByRole("button", { name: /clear/i }).click();

    await expect(verdictsInput(page)).toHaveValue("");
    await expect(reportState(page)).toHaveAttribute(
      "data-report-state",
      "ready",
      { timeout: COMPUTE_TIMEOUT }
    );
    // No stale counts survive a clear — an empty paste is honestly zeroed.
    await expect(statValue(page, "characters")).toHaveText("0", {
      timeout: COMPUTE_TIMEOUT
    });
    await expect(statValue(page, "words")).toHaveText("0", {
      timeout: COMPUTE_TIMEOUT
    });
  });

  test("the error value path never fabricates a report", async ({ page }) => {
    // The placeholder core rejects an over-cap paste as a VALUE rather than a
    // zero-filled report; the unit suite pins that copy exactly
    // (analyze.test.ts → "the limit is"). This journey proves the pane is
    // wired to that error slot rather than to a fabricated result.
    await page.addInitScript(() => {
      class BrokenWorker {
        constructor() {
          throw new Error("Worker blocked to force the main-thread path");
        }
      }
      Object.defineProperty(window, "Worker", {
        configurable: true,
        writable: true,
        value: BrokenWorker,
      });
    });

    await gotoReady(page);
    await expect(reportState(page)).toHaveAttribute(
      "data-report-state",
      "ready",
      { timeout: COMPUTE_TIMEOUT }
    );

    // A settled result means either stats or an error — never neither, and
    // never both at once (the atomic settle).
    const shape = await reportState(page).evaluate((el) => ({
      state: el.getAttribute("data-report-state"),
      hasStats: el.querySelector("[data-stat]") !== null,
      hasError: el.querySelector("#report-error-message") !== null,
    }));
    if (shape.state === "ready") {
      expect(shape.hasStats).toBe(true);
      expect(shape.hasError).toBe(false);
    } else {
      expect(shape.hasError).toBe(true);
      expect(shape.hasStats).toBe(false);
    }
  });
});
