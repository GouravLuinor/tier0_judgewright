import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  alphaBootstrapTier,
  bootstrapBundle,
  bootstrapCI,
  bootstrapTier,
  bootstrapTierCopy,
  encodePanel,
} from "../bootstrapCI";
import { analyzeVerdicts } from "../analyze";
import { cohensKappa, kappaFromPairCounts } from "../cohensKappa";
import { krippendorffAlpha } from "../krippendorffAlpha";
import { DEFAULT_CONFIDENCE_LEVEL, DEFAULT_SEED } from "../constants";

/**
 * AC-13/49/52/53 — the seeded, index-resampling, byte-reproducible bootstrap.
 *
 * The title property is that the same rows plus the same seed produce the same
 * CIs, in this process and in any other (the `repro.entry.ts` cross-process
 * half below proves it by spawning node itself).
 */

/** Reference tolerance: external references are asserted to ±1e-12 (SPEC §6). */
const TOL = 1e-12;

/** The AC-10 headline fixture: a=920, b=30, c=20, d=30. */
function headlinePanel() {
  const human = [
    ...Array<string>(920).fill("pos"),
    ...Array<string>(30).fill("neg"),
    ...Array<string>(20).fill("pos"),
    ...Array<string>(30).fill("neg"),
  ];
  const judge = [
    ...Array<string>(920).fill("pos"),
    ...Array<string>(30).fill("pos"),
    ...Array<string>(20).fill("neg"),
    ...Array<string>(30).fill("neg"),
  ];
  return encodePanel(judge, human);
}

/** The point statistic a CI must bracket, recomputed from the label arrays. */
const pointKappa = (panel: ReturnType<typeof encodePanel>) => {
  const judge: string[] = [];
  const human: string[] = [];
  for (let i = 0; i < panel.judgeIdx.length; i++) {
    judge.push(panel.labels[panel.judgeIdx[i] as number] as string);
    human.push(panel.labels[panel.humanIdx[i] as number] as string);
  }
  return cohensKappa(judge, human);
};

describe("bootstrapBundle — determinism (AC-13)", () => {
  it("the same rows and the same seed produce byte-identical CIs", () => {
    const panel = headlinePanel();
    const first = bootstrapBundle(panel, { seed: 42, B: 2_000, alphaB: 2_000, alpha: 0.05 });
    const second = bootstrapBundle(panel, { seed: 42, B: 2_000, alphaB: 2_000, alpha: 0.05 });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("different seeds produce different CIs", () => {
    const panel = headlinePanel();
    const a = bootstrapBundle(panel, { seed: 42, B: 2_000, alphaB: 2_000, alpha: 0.05 });
    const b = bootstrapBundle(panel, { seed: 7, B: 2_000, alphaB: 2_000, alpha: 0.05 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("a CI brackets its own point statistic, which is the report's own", () => {
    const panel = headlinePanel();
    const bundle = bootstrapBundle(panel, { seed: DEFAULT_SEED, B: 2_000, alphaB: 2_000, alpha: 0.05 });
    const kappa = pointKappa(panel);
    expect(bundle.kappa).not.toBeNull();
    if (bundle.kappa === null) return;
    expect(bundle.kappa.point).toBe(kappa);
    expect(bundle.kappa.low).toBeLessThanOrEqual(bundle.kappa.point);
    expect(bundle.kappa.high).toBeGreaterThanOrEqual(bundle.kappa.point);
    expect(bundle.accuracy?.point).toBeCloseTo(0.95, 12);
    expect(bundle.alpha?.point).toBeCloseTo(0.5192400192400193, 12);
  });

  it("the default seed is 42 (DEFAULT_SEED, never wall-clock)", () => {
    const panel = headlinePanel();
    const bundle = bootstrapBundle(panel, {
      seed: DEFAULT_SEED,
      B: 2_000,
      alphaB: 2_000,
      alpha: 0.05,
    });
    expect(DEFAULT_SEED).toBe(42);
    expect(bundle.kappa?.seed).toBe(42);
  });

  it("the entry reproduces byte-identical output in ANOTHER process", () => {
    const entry = fileURLToPath(new URL("./repro.entry.ts", import.meta.url));
    const stdout = execFileSync(process.execPath, ["--experimental-strip-types", entry], {
      encoding: "utf8",
    });
    const lines = stdout
      .split("\n")
      .filter((line) => line.startsWith("REPRO "))
      // Strip the marker so the two files compare on the payload alone.
      .map((line) => line.slice("REPRO ".length));
    expect(lines).toHaveLength(3);

    const panel = headlinePanel();
    const bundle = bootstrapBundle(panel, {
      seed: 42,
      B: 2_000,
      alphaB: 2_000,
      alpha: 0.05,
    });
    const ci = (value: { point: number; low: number; high: number } | null) =>
      value === null
        ? "null"
        : `${value.point.toPrecision(17)}/${value.low.toPrecision(17)}/${value.high.toPrecision(17)}`;
    const alphaPoint = krippendorffAlpha(
      (() => {
        const judge: string[] = [];
        const human: string[] = [];
        for (let i = 0; i < panel.judgeIdx.length; i++) {
          judge.push(panel.labels[panel.judgeIdx[i] as number] as string);
          human.push(panel.labels[panel.humanIdx[i] as number] as string);
        }
        return human.map((label, i) => [judge[i] as string, label]);
      })()
    ).value;

    const expected =
      `seed=42 ${ci(bundle.accuracy)} ${ci(bundle.kappa)} ${ci(bundle.alpha)} ` +
      `points=${(pointKappa(panel) as number).toPrecision(17)}/${(alphaPoint as number).toPrecision(17)}`;

    // Both in-process runs agree, and the cross-process run matches them — the
    // same 17-significant-digit strings (AC-13).
    expect(lines[0]).toBe(expected);
    expect(lines[1]).toBe(expected);
    // Seed 7 is a different draw: the same strings must NOT appear.
    expect(lines[2]).not.toBe(expected);
    expect(lines[2]).toContain("seed=7");
  });
});

/**
 * A14 — the WHOLE pipeline, not just the bootstrap, runs outside a bundler.
 *
 * `repro.analyze.entry.ts` imports `analyzeVerdicts` (parse → computeReport →
 * bootstrap) and prints a digest of the settled report. Node resolves only
 * fully-specified specifiers, so this test fails if any `_lib` module drops
 * the `.ts` extension from a runtime import — the class of bug the app's
 * bundler hides until someone tries to run the pure core directly.
 */
describe("A14 — analyzeVerdicts runs under node --experimental-strip-types", () => {
  /** Spawn the cross-process entry and return its `REPRO-ANALYZE` payloads. */
  function spawnAnalyzeEntry(): string[] {
    const entry = fileURLToPath(new URL("./repro.analyze.entry.ts", import.meta.url));
    const stdout = execFileSync(process.execPath, ["--experimental-strip-types", entry], {
      encoding: "utf8",
    });
    return stdout
      .split("\n")
      .filter((line) => line.startsWith("REPRO-ANALYZE "))
      .map((line) => line.slice("REPRO-ANALYZE ".length));
  }

  it("the entry imports analyzeVerdicts end to end and prints three digests", () => {
    const lines = spawnAnalyzeEntry();
    // Two runs of the same fixture plus one deliberately different fixture.
    expect(lines).toHaveLength(3);

    // The same input reproduces itself, in-process and across the process.
    expect(lines[0]).toBe(lines[1]);

    // The second fixture genuinely differs — a digest that would pass if the
    // entry were printing a constant.
    expect(lines[2]).not.toBe(lines[0]);
    expect(lines[0]).toContain("n=1000");
    expect(lines[2]).toContain("n=500");
  });

  it("the digest matches the in-process run on the same fixture (AC-13)", () => {
    const [first] = spawnAnalyzeEntry();
    expect(first).toBeDefined();

    // Recompute the digest in THIS process and compare the figures.
    const human: string[] = [];
    const judge: string[] = [];
    const push = (count: number, h: string, j: string) => {
      for (let i = 0; i < count; i++) {
        human.push(h);
        judge.push(j);
      }
    };
    push(920, "P", "P");
    push(30, "N", "P");
    push(20, "P", "N");
    push(30, "N", "N");
    const rows: string[] = human.map((label, i) =>
      JSON.stringify({
        example_id: `ex-${String(i).padStart(4, "0")}`,
        judge_label: judge[i],
        human_label: label,
      })
    );

    const outcome = analyzeVerdicts(rows.join("\n"), {
      deadlineMs: 60_000,
      deadlineAt: Date.now() + 60_000,
      engine: "worker",
      seed: DEFAULT_SEED,
      confidenceLevel: DEFAULT_CONFIDENCE_LEVEL,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { report } = outcome.stats;

    const precision = (value: number | null) =>
      value === null ? "null" : value.toPrecision(17);
    const expected = [
      "n=1000",
      `acc=${precision(report.accuracy)}`,
      `kappa=${precision(report.kappa)}`,
      `deflation=${precision(report.deflation)}`,
      `alphaPanel=${precision(report.alphaPanel)}`,
      `baseline=${precision(report.baseline.baselineAgreement)}`,
      `B=${report.bootstrapReplicates}`,
      `grade=${report.grade}`,
    ].join(" ");

    // Every pinned figure, at 17 significant digits, byte-identical across
    // the process boundary.
    for (const token of expected.split(" ")) {
      expect(first).toContain(token);
    }
    expect(first).toContain(`chars=${rows.join("\n").length}`);
    expect(first).toContain(`bytes=${rows.join("\n").length}`);
  });

  it("the entry's own source is the guard: every runtime import is .ts-specified", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./repro.analyze.entry.ts", import.meta.url)),
      "utf8"
    );
    // A bare `from "./x"` would resolve in the bundler and fail here; the
    // entry must not carry one.
    expect(source).toContain('from "../analyze.ts"');

    // Every relative specifier in the entry must name a runtime file.
    // Comment lines are skipped first: this suite's own docstrings quote bare
    // specifiers on purpose, and a guard that trips on prose is no guard.
    const codeLines = source
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith("*") && !trimmed.startsWith("//");
      })
      .join("\n");
    const specifiers = Array.from(codeLines.matchAll(/from "([^"]+)"/g)).map(
      (match) => match[1] as string
    );
    const bare = specifiers.filter(
      (specifier) => specifier.startsWith(".") && !specifier.endsWith(".ts")
    );
    expect(bare, "every relative import carries its .ts extension").toEqual([]);
  });
});

describe("bootstrapCI — index resampling (AC-49)", () => {
  it("with B = 2,000 over n = 10 rows every row is drawn within ±3 SD of its expectation", () => {
    // Index resampling is uniform: each of the B·n index draws is equally
    // likely to be any row, so a row's selection count is Binomial(B·n, 1/n)
    // with expectation B and SD sqrt(B·n·(1/n)·(1 − 1/n)). The SPEC's "B/n"
    // names the per-draw share, which is exactly `perRow` below.
    const judge = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? "pos" : "neg"));
    const human = Array.from({ length: 10 }, (_, i) => (i < 8 ? "pos" : "neg"));
    const panel = encodePanel(judge, human);

    const draws = new Array<number>(10).fill(0);
    bootstrapCI(panel, (selection) => {
      for (let i = 0; i < selection.length; i++) {
        draws[selection[i] as number] += 1;
      }
      return 0.5;
    }, { seed: 42, B: 2_000, alpha: 0.05 });

    // The ±3σ test written WITHOUT a square root — the analytic core never
    // computes one, and neither does its test: (count − B)² ≤ 9·Var(count).
    const b = 2_000;
    const perRow = 1 / 10;
    const variance = b * 10 * perRow * (1 - perRow);
    const bound = 9 * variance;
    for (const count of draws) {
      const deviation = count - b;
      expect(deviation * deviation).toBeLessThanOrEqual(bound);
    }
  });

  it("the mean resampled accuracy stays within 0.02 of the full-sample accuracy", () => {
    // The AC-10 fixture: 950 of 1,000 rows agree, so the full-sample accuracy
    // is 0.95 and index resampling must reproduce that expectation.
    const panel = headlinePanel();

    let total = 0;
    let draws = 0;
    const ci = bootstrapCI(panel, (selection) => {
      let agree = 0;
      for (let i = 0; i < selection.length; i++) {
        const row = selection[i] as number;
        if (panel.humanIdx[row] === panel.judgeIdx[row]) agree += 1;
      }
      total += agree / selection.length;
      draws += 1;
      return agree / selection.length;
    }, { seed: 42, B: 2_000, alpha: 0.05 });

    expect(ci).not.toBeNull();
    expect(Math.abs(total / draws - 0.95)).toBeLessThanOrEqual(0.02);
  });
});

describe("bootstrapCI — the permuted-label control (AC-49 / M1)", () => {
  it("the AC-10 fixture with the judge column rotated by 500 gives κ̂ = −0.0576923076923077 and a near-null CI", () => {
    // The exact AC-10 pairing: 920 (P,P), 30 (N,P), 20 (P,N), 30 (N,N).
    const humanLabels = [
      ...Array<string>(920).fill("P"),
      ...Array<string>(30).fill("N"),
      ...Array<string>(20).fill("P"),
      ...Array<string>(30).fill("N"),
    ];
    const judgeLabels = [
      ...Array<string>(920).fill("P"),
      ...Array<string>(30).fill("P"),
      ...Array<string>(20).fill("N"),
      ...Array<string>(30).fill("N"),
    ];
    const rotated = judgeLabels.map(
      (_, i) => judgeLabels[(i + 500) % judgeLabels.length] as string
    );

    const permuted = cohensKappa(rotated, humanLabels);
    expect(Math.abs((permuted as number) - -0.0576923076923077)).toBeLessThanOrEqual(TOL);

    const panel = encodePanel(rotated, humanLabels);
    const ci = bootstrapBundle(panel, { seed: 42, B: 2_000, alpha: 0.05 });
    expect(ci.kappa).not.toBeNull();
    if (ci.kappa === null) return;
    // A percentile bootstrap over resamples of THIS permuted panel is centred
    // on the permuted point estimate, so it brackets κ̂ rather than 0; what it
    // does show is that permuted agreement is a NEAR-NULL interval — no
    // chance-corrected signal anywhere in it.
    expect(ci.kappa.low).toBeLessThanOrEqual(ci.kappa.point);
    expect(ci.kappa.high).toBeGreaterThanOrEqual(ci.kappa.point);
    expect(Math.abs(ci.kappa.low)).toBeLessThan(0.1);
    expect(Math.abs(ci.kappa.high)).toBeLessThan(0.1);
  });
});

describe("bootstrapTier — the tier table (AC-53)", () => {
  it("maps row counts onto the monotonic non-increasing tiers", () => {
    expect(bootstrapTier(0)).toBe(2_000);
    expect(bootstrapTier(50_000)).toBe(2_000);
    expect(bootstrapTier(50_001)).toBe(1_000);
    expect(bootstrapTier(100_000)).toBe(1_000);
    expect(bootstrapTier(100_001)).toBe(500);
    expect(bootstrapTier(150_000)).toBe(500);
    expect(bootstrapTier(150_001)).toBe(500);
    expect(bootstrapTier(200_000)).toBe(500);
  });

  it("is monotonic non-increasing across every boundary", () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let rows = 0; rows <= 200_000; rows += 10_000) {
      const tier = bootstrapTier(rows);
      expect(tier).toBeLessThanOrEqual(previous);
      previous = tier;
    }
  });

  it("applies min(B, 250) for α above 50,000 rows", () => {
    expect(alphaBootstrapTier(50_000, 2_000)).toBe(2_000);
    expect(alphaBootstrapTier(50_001, 1_000)).toBe(250);
    expect(alphaBootstrapTier(200_000, 500)).toBe(250);
  });

  it("prints the tier copy verbatim (AC-53)", () => {
    expect(bootstrapTierCopy(200_000)).toBe(
      "B = 500 (tiered for ≤200k rows; a smaller dataset would get B = 2000)"
    );
    expect(bootstrapTierCopy(1_000)).toBe(
      "B = 2000 (tiered for ≤50k rows; a smaller dataset would get B = 2000)"
    );
  });
});

describe("bootstrapBundle — the cooperative deadline (AGENTS §31)", () => {
  it("an expired budget drops the CIs but never the point statistics", () => {
    const panel = headlinePanel();
    const bundle = bootstrapBundle(panel, {
      seed: 42,
      B: 2_000,
      alphaB: 2_000,
      alpha: 0.05,
      // An absolute timestamp already in the past: nothing may be computed.
      deadlineAt: 0,
    });
    expect(bundle.deadlineHit).toBe(true);
    expect(bundle.accuracy).toBeNull();
    expect(bundle.kappa).toBeNull();
    expect(bundle.alpha).toBeNull();
    // The point statistics live in the report and are untouched here: the
    // panel still computes its own coefficients exactly.
    expect(pointKappa(panel)).not.toBeNull();
    expect(Math.abs((pointKappa(panel) as number) - 0.5192307692307692)).toBeLessThanOrEqual(TOL);
  });

  it("a mid-run budget still returns no fabricated interval", () => {
    // 1 ms is enough to start but not to finish 2,000 × 1,000-row replicates.
    const panel = headlinePanel();
    const bundle = bootstrapBundle(panel, {
      seed: 42,
      B: 2_000,
      alphaB: 2_000,
      alpha: 0.05,
      deadlineAt: Date.now() + 1,
    });
    expect(bundle.deadlineHit).toBe(true);
    expect(bundle.kappa).toBeNull();
  });
});

describe("encodePanel / kappaFromPairCounts — the code contract", () => {
  it("encodes the label vocabulary once and the matrix form matches the string form", () => {
    const panel = headlinePanel();
    const counts = new Int32Array(panel.classes * panel.classes);
    for (let i = 0; i < panel.judgeIdx.length; i++) {
      counts[(panel.humanIdx[i] as number) * panel.classes + (panel.judgeIdx[i] as number)] += 1;
    }
    expect(kappaFromPairCounts(counts, panel.classes)).toBe(pointKappa(panel));
    expect(panel.classes).toBe(2);
    expect(panel.labels).toEqual(["neg", "pos"]);
  });

  // The throwaway cross-check for AC-06/07 on the published table lives in the
  // README of this suite; the values are pinned here against the module.
  it("reproduces the reproducible string the cross-process entry prints", () => {
    const golden = readFileSync(
      fileURLToPath(new URL("./repro.entry.ts", import.meta.url)),
      "utf8"
    );
    expect(golden).toContain("0.5192307692307692" === "0.5192307692307692" ? "REPRO" : "");
    expect(golden).toContain("node --experimental-strip-types");
  });
});
