import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * AC-54 — the copy path, end to end.
 *
 * The bar requires: a copy button AND the ⌘⇧C chord, a success toast and a
 * failure toast, and clipboard read-back so the
 * assertion is about what the user actually GETS rather than what a handler
 * was called with. `demos.spec.ts` and `smoke.spec.ts` carry individual
 * journeys through these paths; this file is the named home for the full
 * matrix (BAR §2.5 / AC-54) and is what a reviewer re-runs per control.
 *
 * Selectors are stable hooks only: `data-toast-variant`, the accessible button
 * names, and the clipboard content itself. No fixed sleeps — every assertion
 * is web-first.
 */

const TOOL_URL = "/tools/judgewright";
const COMPUTE_TIMEOUT = 15_000;
const BOUNDED_TIMEOUT = 10_000;

/** Platform-agnostic modifier (resolves to Control on Linux). */
const MOD = "ControlOrMeta";

const verdictsInput = (page: Page) => page.locator("#tool-verdicts-input");
const reportState = (page: Page) => page.locator("[data-report-state]");

/**
 * A four-row fixture with its figures pinned: human {pass×3, fail×1}, judge
 * {pass×2, fail×2}, A = 3 of n = 4 ⇒ accuracy 75.0%, S = 3·2 + 1·2 = 8,
 * κ = (3·4 − 8)/(4² − 8) = 0.5, always-majority baseline 75.0%.
 */
const FIXTURE = [
  '{"example_id":"c-001","judge_label":"pass","human_label":"pass"}',
  '{"example_id":"c-002","judge_label":"fail","human_label":"fail"}',
  '{"example_id":"c-003","judge_label":"pass","human_label":"pass"}',
  '{"example_id":"c-004","judge_label":"fail","human_label":"pass"}',
].join("\n");

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

async function grantClipboard(page: Page) {
  const context = page.context();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
}

async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

/**
 * The most recent toast of a variant. Toasts stack for their auto-dismiss
 * window, so `.last()` is the one the click under test just produced.
 */
function toastOf(page: Page, variant: "success" | "error") {
  return page.locator(`[data-toast-variant="${variant}"]`).last();
}

test.describe("AC-54 — the copy path", () => {
  test.beforeEach(async ({ page }) => {
    await grantClipboard(page);
    await gotoReady(page);
    await fillStable(verdictsInput(page), FIXTURE);
    // Wait for THIS fixture's report before exercising the copy controls.
    await expect(page.locator('[data-stat="kappa"] dd[data-value]')).toHaveAttribute(
      "data-value",
      "0.50000000000000000",
      { timeout: COMPUTE_TIMEOUT }
    );
  });

  test("⌘⇧C copies the one-line verdict and toasts success", async ({ page }) => {
    await page.keyboard.press(`${MOD}+Shift+KeyC`);

    const toast = toastOf(page, "success");
    await expect(toast).toBeVisible({ timeout: BOUNDED_TIMEOUT });
    await expect(toast).toContainText(/copied/i);

    const clipboard = await readClipboard(page);
    expect(clipboard).toContain("4 rows");
    expect(clipboard).toContain("acc 75.0%");
    expect(clipboard).toContain("κ 0.50000000000000000");
    expect(clipboard).toContain("always-majority 75.0%");
  });

  test("the report's Copy verdict button mirrors the chord and toasts success", async ({
    page,
  }) => {
    await page.keyboard.press("Escape");
    // The control's accessible name carries its ⌘⇧C keycap.
    await page
      .locator("#report-pane")
      .getByRole("button", { name: "Copy verdict ⌘⇧C" })
      .click();

    const toast = toastOf(page, "success");
    await expect(toast).toBeVisible({ timeout: BOUNDED_TIMEOUT });

    const clipboard = await readClipboard(page);
    expect(clipboard).toContain("4 rows");
    expect(clipboard).toContain("κ 0.50000000000000000");
  });

  test("each export-bar artifact copies its own content and toasts success", async ({
    page,
  }) => {
    const exportBar = page.locator("[data-export-scope]").locator("..");

    // Copy card — the markdown report.
    await exportBar.getByRole("button", { name: "Copy card" }).click();
    await expect(toastOf(page, "success")).toContainText(/Report card copied/i, {
      timeout: BOUNDED_TIMEOUT,
    });
    const markdown = await readClipboard(page);
    expect(markdown).toContain("κ");
    expect(markdown).toContain("75.0%");

    // Copy one-liner — the same one-line verdict the chord ships.
    await exportBar.getByRole("button", { name: "Copy one-liner" }).click();
    await expect(toastOf(page, "success")).toContainText(
      /One-line verdict copied/i,
      { timeout: BOUNDED_TIMEOUT }
    );
    const oneLiner = await readClipboard(page);
    expect(oneLiner).toContain("4 rows");
    expect(oneLiner).toContain("κ 0.50000000000000000");

    // Copy JSONL — the agreement rows, scoped to the display window.
    await exportBar.getByRole("button", { name: "Copy JSONL" }).click();
    await expect(toastOf(page, "success")).toContainText(
      /Agreement JSONL copied/i,
      { timeout: BOUNDED_TIMEOUT }
    );
    const jsonl = await readClipboard(page);
    expect(jsonl.split("\n").filter((line) => line.trim().length > 0)).toHaveLength(
      4
    );
    expect(jsonl).toContain("c-001");
    expect(jsonl).toContain("c-004");
  });

  test("a failed copy surfaces the error toast with its failure copy", async ({
    page,
  }) => {
    // Force BOTH the async Clipboard API and the hidden-textarea execCommand
    // fallback to fail, the way a denied permission does.
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

    await page.keyboard.press(`${MOD}+Shift+KeyC`);

    const toast = toastOf(page, "error");
    await expect(toast).toBeVisible({ timeout: BOUNDED_TIMEOUT });
    await expect(toast).toContainText(/copy failed/i);
  });

  test("a failed export-bar copy says what to do instead (Download)", async ({
    page,
  }) => {
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

    const exportBar = page.locator("[data-export-scope]").locator("..");
    await exportBar.getByRole("button", { name: "Copy card" }).click();

    const toast = toastOf(page, "error");
    await expect(toast).toBeVisible({ timeout: BOUNDED_TIMEOUT });
    await expect(toast).toContainText(/Could not copy Report card/i);
    await expect(toast).toContainText(/Download/i);
  });

  test("copying is instant: no hover-reveal and no popup (BAR §2.5)", async ({
    page,
  }) => {
    // The buttons are visible and enabled in the default state, not hidden
    // behind a hover or a disclosure.
    const verdictCopy = page
      .locator("#report-pane")
      .getByRole("button", { name: "Copy verdict ⌘⇧C" });
    await expect(verdictCopy).toBeVisible();
    await expect(verdictCopy).toBeEnabled();
    for (const label of ["Copy card", "Copy one-liner", "Copy JSONL"]) {
      await expect(
        page.getByRole("button", { name: label, exact: true })
      ).toBeVisible();
    }

    // The toast auto-dismisses rather than demanding a click.
    await page.keyboard.press(`${MOD}+Shift+KeyC`);
    await expect(toastOf(page, "success")).toBeVisible({
      timeout: BOUNDED_TIMEOUT,
    });
    await expect(toastOf(page, "success")).toBeHidden({
      timeout: 10_000,
    });
  });
});
