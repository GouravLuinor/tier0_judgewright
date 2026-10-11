import { defineConfig, devices } from "@playwright/test";

/**
 * Judgewright Playwright config — reconciled to the real production runtime.
 *
 * Production serves the STANDALONE build (`node .next/standalone/server.js`,
 * port 3005) under PM2 as `judge-norai`, reverse-proxied to judge.norai.tech.
 * So the webServer builds once and then boots THAT SAME standalone server with
 * its static/public assets staged in — exactly what the Dockerfile does — so
 * e2e exercises the shipped artifact (CSP, worker packaging, hydration), not a
 * loose dev server.
 *
 * The Supabase env keys are pinned EMPTY below, which is the default state of
 * the tool: `isSupabaseConfigured` is false, the auth path is a no-op, and no
 * Supabase origin can ever be observed. That is what makes the zero-egress
 * request guard (AC-20) meaningful rather than aspirational.
 *
 * Overrides for local iteration only:
 *   - PW_DEV=1            → boot `next dev` instead (fast to start, but slow
 *                          first-compile here; use for quick debugging).
 *   - reuseExistingServer → if a 3005 server (dev or prod) is already up it is
 *     adopted, so `npm run start && npm run test:e2e` runs the production
 *     build with near-zero overhead.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results",
  // Serial execution: the workstation leans on worker debounce + font-load
  // timing that parallel workers on one server make flaky.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3005",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Boots the real standalone artifact (scripts/serve-standalone.sh stages
    // public/ + .next/static and `exec`s node server.js, so Playwright's own
    // child is the server — nothing is left orphaned on port 3005 to be
    // re-adopted as a stale binary by the next run). PW_DEV=1 swaps to the dev
    // server for quick local debugging.
    command: process.env.PW_DEV ? "npm run dev" : "sh scripts/serve-standalone.sh",
    url: "http://127.0.0.1:3005",
    // Pinned empty so the auth path is a genuine no-op during e2e (AC-20).
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
