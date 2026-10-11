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

    // The deferred calibration card is an explicit placeholder, not a lie.
    await expect(
      station(page).getByText(/Calibration report card — compute enabled in next milestone/i)
    ).toBeVisible();
  });

  test("worker round trip: a paste settles matching character, word, byte and line counts", async ({
    page,
  }) => {
    const payload = "alpha beta gamma\ndelta epsilon zeta\neta";
    const expectedBytes = await page.evaluate(
      (text) => new TextEncoder().encode(text).length,
      payload
    );

    await fillStable(verdictsInput(page), payload);

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

    await expect(statValue(page, "characters")).toHaveText(
      String(payload.length),
      { timeout: COMPUTE_TIMEOUT }
    );
    await expect(statValue(page, "words")).toHaveText("7", {
      timeout: COMPUTE_TIMEOUT,
    });
    await expect(statValue(page, "lines")).toHaveText("3", {
      timeout: COMPUTE_TIMEOUT,
    });
    await expect(statValue(page, "bytes")).toHaveText(String(expectedBytes), {
      timeout: COMPUTE_TIMEOUT,
    });

    // The pane mirrors the analyzed paste verbatim.
    await expect(station(page).getByText(payload).first()).toBeVisible({
      timeout: COMPUTE_TIMEOUT,
    });
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
