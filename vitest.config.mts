import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["**/__tests__/**/*.test.ts"],
    // The pure core and the guards are isomorphic — node is the honest env,
    // and it keeps jsdom/DOM shims out of the unit suite entirely.
    environment: "node",
    exclude: ["**/node_modules/**", "**/.next/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      // Thresholds set by context.md §4.1 and scoped to the pure core — the
      // seam the statistics milestone fills. `npm test` does NOT gate on
      // coverage (see QUALITY_REPORT.md); run `--coverage` to inspect.
      include: ["app/tools/judgewright/_lib/**/*.ts"],
      exclude: ["app/tools/judgewright/_lib/**/__tests__/**", "**/*.d.ts"],
      thresholds: {
        functions: 90,
        lines: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
