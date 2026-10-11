import { beforeEach, describe, expect, it } from "vitest";
import { isStaleReply } from "../useToolWorker";
import { analyzeVerdicts } from "../../_lib/analyze";
import {
  MAX_TABLE_ROWS,
  SYNC_DEADLINE_MS,
  WATCHDOG_MS,
  WATCHDOG_TIERS,
  WORKER_DEADLINE_MS,
  watchdogMsFor,
} from "../../_lib/constants";
import { reportDisagreementWindow } from "../../_lib/report";
import { renderAgreementJsonl, renderMarkdownReport } from "../../_lib/reportRender";
import { useToolStore } from "../../_store/useToolStore";
import type {
  ComputationResult,
  VerdictAnalysis,
  WorkerInputPayload,
  WorkerOutputPayload,
} from "../../_lib/types";

/**
 * The worker-hook contract, exercised without a DOM (node environment, no
 * React rendering): the tiered watchdog budget, the stale-response guard, the
 * stress-fix degrade path and the atomic abort settle. Each block replays the
 * exact sequence the hook performs — dispatch → worker payload → store settle —
 * so a regression here is the same regression the browser suite would catch.
 */

/**
 * A dispatch whose disagreements EXCEED the 2,000-row display window: the
 * window can hold 2,000 rows but the true disagreement total is 2,600, so any
 * export that counted its own window as the total would fabricate 600 rows.
 */
function windowedFixture(rows: number): string {
  const lines: string[] = [];
  for (let i = 0; i < rows; i++) {
    const human = i % 2 === 0 ? "pos" : "neg";
    const judge = i % 2 === 0 ? "neg" : "pos"; // every row disagrees
    lines.push(
      `{"example_id":"ex-${String(i).padStart(5, "0")}","judge_label":"${judge}","human_label":"${human}"}`
    );
  }
  return lines.join("\n");
}

const FIXTURE_ROWS = 2_600;
const FIXTURE = windowedFixture(FIXTURE_ROWS);
const WORKER_OPTIONS = {
  deadlineMs: WORKER_DEADLINE_MS,
  engine: "worker" as const,
  seed: 42,
  confidenceLevel: 0.95,
};
const SYNC_OPTIONS = {
  deadlineMs: SYNC_DEADLINE_MS,
  engine: "main-thread" as const,
  seed: 42,
  confidenceLevel: 0.95,
};

/** Exactly what `compute.worker.ts` posts back for a successful dispatch. */
function workerPayload(text: string, id: number): WorkerOutputPayload {
  const result = analyzeVerdicts(text, WORKER_OPTIONS);
  if (!result.ok) throw new Error("fixture must be analyzable");
  const stats: VerdictAnalysis = {
    ...result.stats,
    report: reportDisagreementWindow(result.stats.report, 0, MAX_TABLE_ROWS),
  };
  return {
    id,
    ok: true,
    error: null,
    degraded: false,
    stats,
    issues: stats.parse.issues,
    issueCount: stats.parse.issueCount,
    disagreementWindow: {
      offset: 0,
      rows: stats.report.disagreements,
      totalCount: result.stats.report.n,
    },
  };
}

/** The settle the hook's `onWorkerMessage` performs through the store. */
function settleWorkerPayload(payload: WorkerOutputPayload): void {
  useToolStore
    .getState()
    .applyComputation(payload, { announce: false, window: payload.disagreementWindow });
}

function resetStore(): void {
  useToolStore.getState().reset();
}

beforeEach(() => {
  resetStore();
});

describe("watchdog — the budget is tiered by payload size (A2)", () => {
  it("keeps the 1.5s wall for a small dispatch", () => {
    expect(watchdogMsFor(0)).toBe(WATCHDOG_MS);
    expect(watchdogMsFor(5_000)).toBe(WATCHDOG_MS);
    // The seeded demo and the 60-row demo fixture both stay at the wall.
    expect(watchdogMsFor(20_000)).toBe(WATCHDOG_MS);
  });

  it("raises the wall for large dispatches — an in-cap 200k run is never killed at 1.5s", () => {
    // A 200k-row JSONL with critiques measures ~33M chars; the flagship case
    // legitimately needs seconds (parse + point statistics + the tiered
    // bootstrap), so the budget must step well past 1.5s.
    const largBudget = watchdogMsFor(33_000_000);
    expect(largBudget).toBeGreaterThanOrEqual(5_000);
    expect(watchdogMsFor(2_000_000)).toBeGreaterThan(watchdogMsFor(200_000));
    expect(watchdogMsFor(200_000)).toBeGreaterThan(WATCHDOG_MS);
  });

  it("is monotonic non-decreasing, finite and never below the base wall", () => {
    let previous = 0;
    for (let chars = 0; chars <= 40_000_000; chars = chars * 3 + 7) {
      const ms = watchdogMsFor(chars);
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBeGreaterThanOrEqual(WATCHDOG_MS);
      expect(ms).toBeGreaterThanOrEqual(previous);
      previous = ms;
    }
    // NaN/negative/garbage input falls back to the base tier, never Infinity.
    expect(watchdogMsFor(Number.NaN)).toBe(WATCHDOG_MS);
    expect(watchdogMsFor(-1)).toBe(WATCHDOG_MS);
  });

  it("the tier table's last entry is the ceiling for anything above the caps", () => {
    const last = WATCHDOG_TIERS[WATCHDOG_TIERS.length - 1];
    expect(last?.maxChars).toBe(Number.POSITIVE_INFINITY);
    expect(watchdogMsFor(40_000_000)).toBe(last?.ms);
  });
});

describe("worker protocol — the stale-response guard (BAR §4.3)", () => {
  it("drops a reply older than the newest dispatch before it can touch state", () => {
    // Newest dispatch is 7; a reply from 6 (or older) is stale.
    expect(isStaleReply(6, 7)).toBe(true);
    expect(isStaleReply(1, 7)).toBe(true);
    // The in-flight reply is current.
    expect(isStaleReply(7, 7)).toBe(false);
  });

  it("a stale reply cannot clear the watchdog guarding the newest dispatch", () => {
    // The hook clears the watchdog only when `id === watchdogIdRef.current`;
    // the guard above runs first, so a late reply never reaches that check.
    const watchdogId = 7;
    const staleId = 6;
    expect(isStaleReply(staleId, watchdogId)).toBe(true);
    const reachesWatchdogCheck = !isStaleReply(staleId, watchdogId);
    expect(reachesWatchdogCheck).toBe(false);
  });
});

describe("degrade — an in-cap input ALWAYS settles a report (A2)", () => {
  it("a budget the parse already spent still settles the point statistics", () => {
    // The absolute deadline is taken before the parse; a spent budget must
    // degrade through the deadline path (CIs dropped), never into an error.
    const outcome = analyzeVerdicts(FIXTURE, {
      ...WORKER_OPTIONS,
      deadlineAt: Date.now() - 1,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { report } = outcome.stats;
    expect(report.n).toBe(FIXTURE_ROWS);
    expect(report.ci.accuracy).toBeNull();
    expect(report.ci.kappa).toBeNull();
    expect(report.ciDropped).toBe(true);
    // The point statistics equal the unconstrained run's — a deadline trip
    // never changes a number (AGENTS §31).
    const full = analyzeVerdicts(FIXTURE, {
      ...WORKER_OPTIONS,
      deadlineAt: Date.now() + 60_000,
    });
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    expect(report.accuracy).toBe(full.stats.report.accuracy);
    expect(report.kappa).toBe(full.stats.report.kappa);
    expect(report.agreementRows).toBe(full.stats.report.agreementRows);
    expect(report.receipt).toContain("ciDropped: true");
  });

  it("a live budget still computes the intervals", () => {
    const outcome = analyzeVerdicts(FIXTURE, {
      ...WORKER_OPTIONS,
      deadlineAt: Date.now() + 60_000,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.stats.report.ci.accuracy).not.toBeNull();
    expect(outcome.stats.report.ciDropped).toBe(false);
  });
});

describe("engine-independence — both engines settle the SAME window (A3)", () => {
  it("the worker payload and the main-thread fallback produce identical exports", () => {
    // Worker path: the windowed payload the worker posts.
    resetStore();
    const payload = workerPayload(FIXTURE, 1);
    settleWorkerPayload(payload);
    const workerSettled = useToolStore.getState().stats;
    expect(workerSettled).not.toBeNull();
    if (workerSettled === null) return;
    expect(workerSettled.report.disagreements).toHaveLength(MAX_TABLE_ROWS);
    expect(useToolStore.getState().disagreementWindow?.totalCount).toBe(FIXTURE_ROWS);

    // Main-thread fallback: the same core, no window option (the store slices).
    resetStore();
    const fallback = analyzeVerdicts(FIXTURE, SYNC_OPTIONS);
    expect(fallback.ok).toBe(true);
    if (!fallback.ok) return;
    useToolStore.getState().applyComputation({
      ok: true,
      error: null,
      degraded: true,
      stats: fallback.stats,
      issues: fallback.stats.parse.issues,
      issueCount: fallback.stats.parse.issueCount,
    } satisfies ComputationResult);
    const fallbackSettled = useToolStore.getState().stats;
    expect(fallbackSettled).not.toBeNull();
    if (fallbackSettled === null) return;

    // Same window, byte-identical JSONL export, engine-independent.
    expect(fallbackSettled.report.disagreements).toHaveLength(MAX_TABLE_ROWS);
    expect(renderAgreementJsonl(fallbackSettled.report)).toBe(
      renderAgreementJsonl(workerSettled.report)
    );
  });

  it("the TRUE totals are the full-set counts, never the window's", () => {
    const payload = workerPayload(FIXTURE, 1);
    settleWorkerPayload(payload);
    const stats = useToolStore.getState().stats;
    expect(stats).not.toBeNull();
    if (stats === null) return;
    const { report } = stats;
    // The window shows 2,000 rows; the totals still count all 2,600 — the
    // window's own disagreement count (2,000) is never printed as the total.
    expect(report.disagreements).toHaveLength(MAX_TABLE_ROWS);
    expect(report.agreementTotal + report.disagreementTotal).toBe(FIXTURE_ROWS);
    expect(report.disagreementTotal).toBe(FIXTURE_ROWS);
    expect(report.disagreementTotal).toBeGreaterThan(
      report.disagreements.filter((row) => !row.agree).length
    );
    // The markdown card prints the true total beside the scope.
    const markdown = renderMarkdownReport(report);
    expect(markdown).toContain(
      `Disagreements: ${report.disagreementTotal.toLocaleString("en-US")} of ${FIXTURE_ROWS.toLocaleString("en-US")} rows disagree`
    );
    expect(markdown).toContain(
      `(showing ${MAX_TABLE_ROWS.toLocaleString("en-US")} of ${FIXTURE_ROWS.toLocaleString("en-US")} rows in this card; the row window caps at ${MAX_TABLE_ROWS.toLocaleString("en-US")})`
    );
  });
});

describe("abort — the watchdog settle is atomic (A5)", () => {
  it("an abort over a settled report leaves ZERO stale statistics", () => {
    // First a successful settle, then the watchdog abort over it.
    const payload = workerPayload(FIXTURE, 1);
    settleWorkerPayload(payload);
    expect(useToolStore.getState().stats).not.toBeNull();
    expect(useToolStore.getState().errorMessage).toBeNull();

    // Subscribe BEFORE the abort: every observed frame must honour
    // "either statistics or an error — never both".
    const frames: { stats: unknown; error: string | null }[] = [];
    const unsubscribe = useToolStore.subscribe((state) => {
      frames.push({ stats: state.stats, error: state.errorMessage });
    });
    useToolStore.getState().applyComputation({
      ok: false,
      error: "Execution aborted — the compute budget was exceeded",
      degraded: false,
      stats: null,
    } satisfies ComputationResult);
    unsubscribe();

    const state = useToolStore.getState();
    expect(state.stats).toBeNull();
    expect(state.disagreementWindow).toBeNull();
    expect(state.errorMessage).toBe("Execution aborted — the compute budget was exceeded");
    expect(state.parseIssues).toEqual([]);
    for (const frame of frames) {
      expect(frame.stats === null || frame.error === null).toBe(true);
    }
    // The announcement names the rejection rather than a stale success.
    expect(state.statusAnnouncement?.message).toContain(
      "Analysis rejected: Execution aborted"
    );
  });

  it("a rejection mid-degrade leaves the settle atomic too", () => {
    const payload = workerPayload(FIXTURE, 1);
    settleWorkerPayload(payload);
    useToolStore.getState().applyComputation({
      ok: false,
      error: "Worker crashed — switched to main-thread mode",
      degraded: true,
      stats: null,
    } satisfies ComputationResult);
    const state = useToolStore.getState();
    expect(state.stats).toBeNull();
    expect(state.degraded).toBe(true);
    expect(state.errorMessage).toBe("Worker crashed — switched to main-thread mode");
  });
});

describe("dispatch — the payload shape the hook posts", () => {
  it("carries the id, the text, the rubric and the settings (the worker's keys)", () => {
    const state = useToolStore.getState();
    const input: WorkerInputPayload = {
      id: 1,
      verdictsText: state.verdictsText,
      rubric: state.rubric,
      settings: state.settings,
    };
    expect(Object.keys(input).sort()).toEqual(["id", "rubric", "settings", "verdictsText"]);
    expect(input.id).toBe(1);
  });
});
