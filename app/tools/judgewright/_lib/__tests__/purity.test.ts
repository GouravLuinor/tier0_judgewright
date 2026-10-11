import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AC-60 — the statistics core contains NO transcendentals, and the core
 * statistics modules do no IO at all. The lint half of the rule is the
 * `no-restricted-properties` entry in `eslint.config.mjs`; this test is the
 * static half, and it runs against the real files on disk.
 */

const LIB_DIR = join(import.meta.dirname, "..");

const FORBIDDEN_MATH = [
  "Math.log(",
  "Math.pow(",
  "Math.exp(",
  "Math.sqrt(",
  "Math.sin(",
  "Math.cos(",
  "Math.atan(",
];

/** The statistics core the no-IO guarantee covers (authGate/supabaseClient are
 * the documented browser-boundary modules and are excluded by name). */
const IO_EXEMPT = new Set(["authGate.ts", "supabaseClient.ts"]);

const IO_TOKENS = ["fetch(", "localStorage", "document.", "window."];

function libFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      files.push(...libFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

const files = libFiles(LIB_DIR);

describe("AC-60 — no transcendentals in _lib", () => {
  it("finds the statistics core modules to scan", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("contains none of the seven forbidden Math methods", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const forbidden of FORBIDDEN_MATH) {
        expect(source.includes(forbidden), `${file} contains ${forbidden}`).toBe(false);
      }
    }
  });
});

describe("_lib purity — the statistics core does no IO", () => {
  it("contains no fetch / storage / DOM tokens outside the auth boundary modules", () => {
    for (const file of files) {
      const name = file.slice(file.lastIndexOf("/") + 1);
      if (IO_EXEMPT.has(name)) continue;
      const source = readFileSync(file, "utf8");
      for (const token of IO_TOKENS) {
        expect(source.includes(token), `${file} contains ${token}`).toBe(false);
      }
    }
  });

  it("every core file is a plain .ts module (no .tsx leaking React in)", () => {
    for (const file of files) {
      expect(file.endsWith(".tsx")).toBe(false);
    }
  });

  it("the constants home has a single definition per constant", () => {
    const constants = readFileSync(join(LIB_DIR, "constants.ts"), "utf8");
    const counts = new Map<string, number>();
    for (const match of constants.matchAll(/export const ([A-Z0-9_]+)/g)) {
      counts.set(match[1] ?? "", (counts.get(match[1] ?? "") ?? 0) + 1);
    }
    for (const [name, count] of counts) {
      expect(count, `${name} is defined more than once`).toBe(1);
    }
  });

  it("the types module imports nothing at runtime", () => {
    const types = readFileSync(join(LIB_DIR, "types.ts"), "utf8");
    expect(types).not.toMatch(/^\s*import\s+[^']/m); // no value imports
    expect(statSync(join(LIB_DIR, "types.ts")).size).toBeGreaterThan(0);
  });
});
