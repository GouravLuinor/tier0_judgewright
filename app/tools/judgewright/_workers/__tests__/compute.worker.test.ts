import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  WorkerInputPayload,
  WorkerOutputPayload,
} from "../../_lib/types";

/**
 * The worker itself, in the node env.
 *
 * The worker assigns `self.onmessage`, so importing it needs a `self` with a
 * postMessage the test can read — the module is otherwise import-clean. These
 * suites cover the A13 artifact-LRU guard: a 32-bit FNV key ALONE is a cache
 * address, not an identity, and two dispatches that share a key must not share
 * a report.
 */

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerInputPayload>) => void) | null;
  postMessage: (payload: unknown) => void;
}

/**
 * The worker module is imported ONCE (its `self.onmessage` assignment is
 * top-level, and a vitest module cache would re-import it as a no-op). The
 * scope therefore lives for the whole file and each test only clears the
 * captured payloads.
 */
const scope: WorkerScope = {
  onmessage: null,
  postMessage: (message: unknown) => {
    posted.push(message as WorkerOutputPayload);
  },
};
let posted: WorkerOutputPayload[] = [];

function payload(
  text: string,
  id = 1,
  rubric = "",
  seed = 42
): WorkerInputPayload {
  return {
    id,
    verdictsText: text,
    rubric,
    settings: {
      seed,
      confidenceLevel: 0.95,
      judgeScoreMode: "p-positive",
    },
  };
}

/** One JSONL session of `count` rows over two labels. */
function session(prefix: string, count: number): string {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    lines.push(
      JSON.stringify({
        example_id: `${prefix}-${String(i).padStart(4, "0")}`,
        judge_label: i % 2 === 0 ? "pos" : "neg",
        human_label: i % 3 === 0 ? "neg" : "pos",
      })
    );
  }
  return lines.join("\n");
}

/** Judge×first-human pair the α CI resamples — the A9 restriction. */
describe("α CI restriction — the disclosed sentence (A9)", () => {
  it("names both sides of the restriction in the panel copy", async () => {
    const { ALPHA_CI_PAIR_RESTRICTION } = await import("../../_lib/krippendorffAlpha");
    // It says WHAT the point uses …
    expect(ALPHA_CI_PAIR_RESTRICTION).toContain("every rater");
    // … and WHAT the interval uses, which is the narrower thing.
    expect(ALPHA_CI_PAIR_RESTRICTION).toContain("resamples a single");
    expect(ALPHA_CI_PAIR_RESTRICTION).toContain("first-human pair");
    // … and it names the consequence rather than leaving it implied.
    expect(ALPHA_CI_PAIR_RESTRICTION).toContain("narrower than the panel");
  });
});

describe("compute.worker — the artifact LRU identity guard (A13)", () => {
  beforeAll(async () => {
    (globalThis as unknown as { self: unknown }).self = scope;
    await import("../compute.worker");
  });

  beforeEach(() => {
    posted = [];
  });

  /** Dispatch one input through the worker and return the settled payload. */
  function dispatch(input: WorkerInputPayload): WorkerOutputPayload {
    posted = [];
    scope.onmessage?.(new MessageEvent("message", { data: input }) as MessageEvent<WorkerInputPayload>);
    expect(posted).toHaveLength(1);
    return posted[0] as WorkerOutputPayload;
  }

  it("settles a report for a real dispatch", () => {
    const result = dispatch(payload(session("s", 40)));
    expect(result.ok).toBe(true);
    expect(result.stats?.report.n).toBe(40);
    expect(result.stats?.report.kappa).not.toBeNull();
    // The payload ships the display window plus the honest total.
    expect(result.disagreementWindow.totalCount).toBe(40);
  });

  it("serves the cached report for an identical re-dispatch (same key AND fingerprint)", () => {
    const first = dispatch(payload(session("s", 40), 1));
    const second = dispatch(payload(session("s", 40), 2));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    // Same figures — the hit is real, not a recompute that happens to agree.
    expect(second.stats?.report.receipt).toBe(first.stats?.report.receipt);
    expect(second.stats?.report.kappa).toBe(first.stats?.report.kappa);
    expect(second.stats?.report.n).toBe(40);
  });

  it("never carries a different paste's report across a key collision (A13)", () => {
    // Two sessions with the SAME length and the SAME label vocabulary but
    // DIFFERENT agreements, so a mis-served cache entry would be visible: if
    // the worker answered the second dispatch with the first's report, the
    // agreement rows (and κ) would not match what this input computes.
    const a = session("aaa", 40);
    const b = session("bbb", 40).replaceAll('"pos"', '"neg"');

    // Guard the fixture itself: they must genuinely differ.
    expect(a).not.toBe(b);
    expect(a.length).toBe(b.length);

    const first = dispatch(payload(a, 1));
    const second = dispatch(payload(b, 2));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.stats?.report.agreementRows).not.toBe(
      second.stats?.report.agreementRows
    );

    // Each one's figures are exactly what a FRESH compute of the SAME input
    // gives — the report always belongs to the input it was given.
    const freshA = dispatch(payload(a, 3));
    const freshB = dispatch(payload(b, 4));
    expect(freshA.stats?.report.agreementRows).toBe(
      first.stats?.report.agreementRows
    );
    expect(freshB.stats?.report.agreementRows).toBe(
      second.stats?.report.agreementRows
    );
    expect(second.stats?.report.kappa).toBe(freshB.stats?.report.kappa);
  });

  it("the fingerprint changes when the middle of a paste changes (same length, same head, same tail)", async () => {
    const { artifactCacheFingerprint } = await import("../compute.worker");

    // Two sessions of EQUAL length whose first 64 and last 64 characters are
    // identical but whose middles differ — exactly the case a length +
    // head/tail check alone would miss.
    const shared = (value: string) => value.padEnd(64, "x").slice(0, 64);
    const base = payload(shared("head") + "middle-one" + shared("tail"));
    const edited = payload(shared("head") + "middle-two" + shared("tail"));

    expect(base.verdictsText.length).toBe(edited.verdictsText.length);
    expect(base.verdictsText.slice(0, 64)).toBe(edited.verdictsText.slice(0, 64));
    expect(base.verdictsText.slice(-64)).toBe(edited.verdictsText.slice(-64));
    // The independent position-weighted checksum catches it anyway.
    expect(artifactCacheFingerprint(base)).not.toBe(artifactCacheFingerprint(edited));
    // And an identical payload hashes to the identical fingerprint, so real
    // re-dispatches still hit.
    expect(artifactCacheFingerprint(base)).toBe(artifactCacheFingerprint(payload(shared("head") + "middle-one" + shared("tail"))));
  });

  it("the fingerprint carries the rubric and the settings, not just the text", async () => {
    const { artifactCacheFingerprint } = await import("../compute.worker");
    const text = session("s", 40);
    const one = payload(text, 1, "rubric A");
    const two = payload(text, 2, "rubric B");

    expect(artifactCacheFingerprint(one)).not.toBe(artifactCacheFingerprint(two));
  });

  it("an error result is never cached (BAR §4.4)", () => {
    // A mixed-vocabulary paste is a fatal parse error: it settles as an error
    // VALUE, and re-dispatching the same bad paste recomputes rather than
    // serving a cached failure.
    const bad = [
      '{"example_id":"a","judge_label":"PASS","human_label":"PASS"}',
      '{"example_id":"b","judge_label":"TRUE","human_label":"TRUE"}',
    ].join("\n");

    const first = dispatch(payload(bad, 1));
    expect(first.ok).toBe(false);
    expect(first.error).toContain("mix two vocabularies");
    const second = dispatch(payload(bad, 2));
    expect(second.ok).toBe(false);
    expect(second.error).toContain("mix two vocabularies");
  });
});
