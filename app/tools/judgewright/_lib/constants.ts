/**
 * Judgewright — every cap, budget and key in ONE import site (BAR §4.4).
 *
 * Pure module: no React, no DOM, no IO. The statistics milestone renames this
 * to `_lib/limits.ts` (ARCHITECTURE §5) or keeps it as the single home; either
 * way every constant below has exactly one definition here.
 *
 * BAR mapping note — every Tier-0 tool carries the same constant names so a
 * reviewer can re-run BAR §10 item 7 with zero judgement calls. Judgewright's
 * caps are row/char budgeted rather than match budgeted:
 *
 * | Bar constant (BAR §4.4)      | Judgewright constant        | Value      |
 * | ---------------------------- | --------------------------- | ---------- |
 * | MAX_TEST_LENGTH              | MAX_INPUT_CHARS             | 40,000,000 |
 * | MAX_MATCHES                  | MAX_ROWS                    | 200,000    |
 * | WORKER_DEADLINE_MS           | WORKER_DEADLINE_MS          | 1,000      |
 * | SYNC_DEADLINE_MS             | SYNC_DEADLINE_MS            | 800        |
 * | WATCHDOG_MS                  | WATCHDOG_MS                 | 1,500      |
 * | ARTIFACT_CACHE_CAPACITY      | ARTIFACT_CACHE_CAPACITY     | 32         |
 * | (bar-specific addition)      | MAX_COLS                    | 64         |
 * | (bar-specific addition)      | MAX_TABLE_ROWS              | 2,000      |
 */

// ── Identity & storage keys ────────────────────────────────────────────────
export const TOOL_NAME = "Judgewright";
export const TOOL_SLUG = "judgewright";
/** zustand persist key for user content (never merge the theme key in). */
export const STORAGE_KEY = "judgewright-tool-storage";
/** next-themes storage key — per tool, so siblings never collide. */
export const THEME_STORAGE_KEY = "judgewright-theme";
export const STORAGE_VERSION = 1;

// ── Input caps (SPEC §2.1, ARCHITECTURE §5) ────────────────────────────────
/** Rows analyzed per run; the true total is still counted and disclosed. */
export const MAX_ROWS = 200_000;
/** Header sanity — more than this is a `capacity` parse error. */
export const MAX_COLS = 64;
/**
 * 40 MB paste ceiling; beyond → clear error, nothing parsed.
 *
 * A16 — the A16 capacity interaction, disclosed here because it is a property
 * of the two caps ABOVE: MAX_ROWS (200,000) and MAX_INPUT_CHARS (40,000,000)
 * multiply. A row that carries a judge critique is ~205 characters, so 200,000
 * critique-bearing rows ≈ 41 MB — just past the character limit. The two caps
 * therefore NEVER both bind: the REAL row capacity of a critique-bearing
 * session is ≈190,000 rows (40 MB ÷ ~205 chars), not the 200,000 MAX_ROWS
 * advertises. A paste that large is rejected by the character limit with its
 * true size named, never silently truncated to 200,000 rows.
 */
export const MAX_INPUT_CHARS = 40_000_000;
/** Rubric pane cap (SPEC §2.1.7). */
export const MAX_RUBRIC_CHARS = 8_000;
/** Disagreement-table display cap inside the virtualised window (M3). */
export const MAX_TABLE_ROWS = 2_000;
/** Rows sent to the single opt-in LLM diagnosis (M4). */
export const DIAGNOSIS_DISAGREEMENT_LIMIT = 25;

/**
 * A11 — the per-field excerpt cap on the transmitted diagnosis request. A
 * judge session may legally carry multi-megabyte `judge_critique` /
 * `judge_input` / `judge_output` cells (the caps above permit them), so
 * shipping them verbatim would build a request measured in HUNDREDS OF MB
 * (25 rows × 4 fields × 40 MB) — a self-inflicted DoS on the user's own pane
 * and a request no provider accepts. Each field is excerpted to this length
 * with an ellipsis marker, and the disclosed payload shows EXACTLY what is
 * sent, so the excerpt is visible rather than silent.
 */
export const DIAGNOSIS_EXCERPT_CHARS = 2_000;

/**
 * A11 — the response cap. The curated arrays are rejected with a `format`
 * error beyond this many entries, so a hostile or broken model cannot return
 * a response that freezes the pane while it renders (or floods it).
 */
export const DIAGNOSIS_MAX_ARRAY_ITEMS = 32;

/** A11 — the per-string cap inside a curated response array. */
export const DIAGNOSIS_MAX_STRING_CHARS = 2_000;
/**
 * Parse issues DISPLAYED per run (SPEC §2.1.3: the first 5 are listed with
 * the offending line quoted). `ParseResult.issueCount` stays the honest total.
 */
export const MAX_PARSE_ISSUES = 5;

/**
 * A1 — the largest paste the store PERSISTS for reload. A judge session can
 * legally reach MAX_INPUT_CHARS (40 MB), but no browser storage quota holds
 * that: an unbounded write throws QuotaExceededError out of the store's
 * `set()`, which unmounts the tree and loses the paste. The persisted slice is
 * therefore BOUNDED — pastes above this length are not written at all (the
 * settings and rubric still are), and a reload simply does not restore them.
 */
export const MAX_PERSISTED_TEXT_CHARS = 1_000_000;

// ── Bootstrap tiers (deterministic; never wall-clock adaptive) ─────────────
export const BOOTSTRAP_B = 2_000;
/** Lower bound so a CI is still reported at tiny n. */
export const BOOTSTRAP_MIN_B = 200;
/**
 * Monotonic non-increasing by row count (asserted at AC-53):
 * ≤50,000 → 2,000 · ≤100,000 → 1,000 · ≤150,000 → 500 · ≤200,000 → 500.
 */
export const BOOTSTRAP_TIERS: readonly { maxRows: number; b: number }[] = [
  { maxRows: 50_000, b: 2_000 },
  { maxRows: 100_000, b: 1_000 },
  { maxRows: 150_000, b: 500 },
  { maxRows: 200_000, b: 500 },
];
/** α-specific tier (`min(B, 250)` above 50,000 rows) — disclosed, never silent. */
export const BOOTSTRAP_ALPHA_B = 250;

// ── Time budgets (BAR §4.3/§4.4, verbatim sibling values) ──────────────────
/** Cooperative budget inside the worker (self-reports under the watchdog). */
export const WORKER_DEADLINE_MS = 1_000;
/** Stricter — protects UI frames on the main-thread fallback path. */
export const SYNC_DEADLINE_MS = 800;
/** Hard wall-clock before terminate + respawn. */
export const WATCHDOG_MS = 1_500;

/**
 * A10 — how often the parse loop re-reads the wall clock. SYNC_DEADLINE_MS
 * (like WORKER_DEADLINE_MS) used to govern ONLY `computeReport`, so the parse
 * that runs BEFORE it was unbounded: a pathological paste could hold the main
 * thread for as long as it liked. The parse loop now carries the SAME absolute
 * budget and checks it every N rows, so the clock is read O(rows / N) times
 * instead of once per row (the amortized-cadence pattern of BAR §4.4).
 */
export const PARSE_DEADLINE_CHECK_ROWS = 512;
/**
 * A2 — the watchdog budget is TIERED by dispatch size. The 1.5s wall is right
 * for a small paste, but an in-cap 200k-row dispatch legitimately needs
 * seconds (parse + point statistics + the tiered bootstrap); killing it at
 * 1.5s aborts a legitimate run and discards the whole report. The budget
 * therefore steps up with the payload and stays bounded, so a genuine
 * unkillable hang still trips the watchdog.
 */
export const WATCHDOG_TIERS: readonly { maxChars: number; ms: number }[] = [
  { maxChars: 20_000, ms: WATCHDOG_MS },
  { maxChars: 200_000, ms: 3_000 },
  { maxChars: 2_000_000, ms: 5_000 },
  { maxChars: Number.POSITIVE_INFINITY, ms: 8_000 },
];

/**
 * The watchdog budget for one dispatch: monotonic non-decreasing in payload
 * size, always finite, and never below WATCHDOG_MS (asserted in
 * `_hooks/__tests__/useJudgewrightWorker.test.ts`).
 */
export function watchdogMsFor(chars: number): number {
  const length = Number.isFinite(chars) ? Math.max(0, Math.floor(chars)) : 0;
  for (const tier of WATCHDOG_TIERS) {
    if (length <= tier.maxChars) return tier.ms;
  }
  return WATCHDOG_TIERS[WATCHDOG_TIERS.length - 1]?.ms ?? WATCHDOG_MS;
}
/**
 * How long the worker may take to load before the hook gives up on it and
 * computes on the main thread instead. Generous on purpose: on mobile data the
 * worker chunk is a separate download, and the old behaviour (watchdog armed
 * before the worker existed) settled the 12-row demo as "budget exceeded".
 */
export const WORKER_BOOT_TIMEOUT_MS = 20_000;

/**
 * The watchdog's user-facing copy: what happened, that nothing was lost, and
 * what to do next. Seconds are printed from the tier that actually applied.
 */
export function watchdogAbortCopy(ms: number): string {
  const seconds = (ms / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 });
  return `Analysis did not finish within its ${seconds} s limit. Your rows are still here: run it again, or split the file into smaller pastes.`;
}

/** Collapse typing bursts into one screen-reader update. */
export const SUCCESS_ANNOUNCE_DEBOUNCE_MS = 800;

// ── Adaptive debounce tiers by input length ────────────────────────────────
export const DEBOUNCE_SMALL_MAX_CHARS = 5_000;
export const DEBOUNCE_MEDIUM_MAX_CHARS = 20_000;
export const DEBOUNCE_XLARGE_MAX_CHARS = 200_000;
export const DEBOUNCE_SMALL_MS = 0;
export const DEBOUNCE_MEDIUM_MS = 40;
export const DEBOUNCE_LARGE_MS = 120;
export const DEBOUNCE_XLARGE_MS = 250;

// ── Worker artifact LRU ────────────────────────────────────────────────────
/** LRU entries in the worker, keyed by an input hash (recency refresh on hit). */
export const ARTIFACT_CACHE_CAPACITY = 32;
/** How much of the paste the pane mirrors back into the echo panel. */
export const ECHO_LIMIT_CHARS = 4_000;

// ── Analysis defaults ──────────────────────────────────────────────────────
export const DEFAULT_SEED = 42;
export const DEFAULT_CONFIDENCE_LEVEL = 0.95;

// ── Optional LLM diagnosis (M4): zero-egress by default ────────────────────
/**
 * The optional BYOK diagnosis is OFF until a key is supplied by the user, and
 * it is never armed automatically: the default path contacts nothing. The CSP
 * allow-list below documents every origin the product is even *allowed* to
 * contact; the e2e request guard (AC-20) proves the default path uses none of
 * the non-`'self'` origins.
 */
export const AUTO_DIAGNOSIS_ENABLED = false;

/**
 * The single documented list of every origin allowed in `connect-src`.
 * openrouter.ai left this list when the diagnosis panel left the UI
 * (2026-10-22): the `_services` engine stays, but nothing on the page can
 * call it, so the page is not allowed to reach it either.
 * `next.config.ts` builds the CSP from exactly this list, and the static
 * `csp.test.ts` asserts the shipped header never drifts past it.
 */
export const DECLARED_ORIGINS: readonly string[] = [
  "'self'",
  "https://*.supabase.co",
  "wss://*.supabase.co",
];

/** Copy shown by the status strip while the optional diagnosis stays idle. */
export const AUTO_DIAGNOSIS_OFF_COPY = "auto-diagnosis off";

/**
 * M5/AC-18: the ≤25 diagnosis rows are ranked by confusion-cell frequency and
 * drawn ROUND-ROBIN across distinct cells, so the diagnosis sees every pattern
 * the judge got wrong instead of 25 copies of its single worst cell.
 */
export const DIAGNOSIS_SELECTION_COPY =
  "the diagnosis rows are ranked by confusion-cell frequency and drawn round-robin across distinct cells (one per cell at a time, highest-frequency cell first; ties by example_id ascending)";
