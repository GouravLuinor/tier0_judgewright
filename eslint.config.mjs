import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      "next-env.d.ts",
      ".agents/**",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // AC-60 (AGENTS §33 / SPEC §2.4.4): the compute core contains NO
  // transcendentals. `Math.log/pow/exp/sqrt/sin/cos/atan` are banned inside
  // `_lib/**` — the static half of the rule is eslint, the dynamic half is
  // `_lib/__tests__/purity.test.ts`. `Math.round/min/max/abs` stay allowed.
  {
    files: ["app/tools/judgewright/_lib/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        ...[
          ["log"],
          ["pow"],
          ["exp"],
          ["sqrt"],
          ["sin"],
          ["cos"],
          ["atan"],
        ].map(([property]) => ({
          object: "Math",
          property,
          message: `Math.${property} is banned in _lib (AC-60): the compute core is exact integer/rational arithmetic only.`,
        })),
      ],
    },
  },
];

export default eslintConfig;
