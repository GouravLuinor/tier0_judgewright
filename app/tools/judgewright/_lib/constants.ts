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
/** 40 MB paste ceiling; beyond → clear error, nothing parsed. */
export const MAX_INPUT_CHARS = 40_000_000;
/** Rubric pane cap (SPEC §2.1.7). */
export const MAX_RUBRIC_CHARS = 8_000;
/** Disagreement-table display cap inside the virtualised window (M3). */
export const MAX_TABLE_ROWS = 2_000;
/** Rows sent to the single opt-in LLM diagnosis (M4). */
export const DIAGNOSIS_DISAGREEMENT_LIMIT = 25;

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
 * `next.config.ts` builds the CSP from exactly this list, and the static
 * `csp.test.ts` asserts the shipped header never drifts past it.
 */
export const DECLARED_ORIGINS: readonly string[] = [
  "'self'",
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://openrouter.ai",
];

/** Copy shown by the status strip while the optional diagnosis stays idle. */
export const AUTO_DIAGNOSIS_OFF_COPY = "auto-diagnosis off";
