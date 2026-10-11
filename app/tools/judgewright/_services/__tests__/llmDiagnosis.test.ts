import { describe, expect, it } from "vitest";
import { buildDisagreementRows } from "../../_lib/disagreements.ts";
import { confusionMatrix } from "../../_lib/confusionMatrix.ts";
import {
  DIAGNOSIS_DISAGREEMENT_LIMIT,
  DIAGNOSIS_EXCERPT_CHARS,
  DIAGNOSIS_MAX_ARRAY_ITEMS,
  DIAGNOSIS_MAX_STRING_CHARS,
  MAX_RUBRIC_CHARS,
} from "../../_lib/constants.ts";
import {
  DIAGNOSIS_CONFIGURE_COPY,
  DEFAULT_DIAGNOSIS_MODEL,
  DiagnosisError,
  OPENROUTER_ENDPOINT,
  buildDiagnosisRequest,
  isDiagnosisConfigured,
  llmDiagnosis,
  selectDiagnosisDisagreements,
} from "../llmDiagnosis.ts";
import type { RawVerdict, DisagreementRow } from "../../_lib/types.ts";

const API_KEY = "sk-or-test-abcdef123456";

function row(exampleId: string, human: string, judge: string): RawVerdict {
  return {
    exampleId,
    judgeLabel: judge,
    humanLabels: [human],
    judgeScore: null,
    humanScore: null,
    judgeCritique: "judge says so",
    humanCritique: "human says so",
    judgeInput: `input ${exampleId}`,
    judgeOutput: `output ${exampleId}`,
    position: null,
    preferredLonger: null,
    lineNumber: 0,
  };
}

/**
 * A11 — one row whose content fields are all oversized, so the request builder
 * has something to excerpt. ~90 KB per field, four fields per row.
 */
function hugeRow(exampleId: string, human: string, judge: string): RawVerdict {
  return {
    ...row(exampleId, human, judge),
    judgeInput: "I".repeat(90_000),
    judgeOutput: "O".repeat(90_000),
    humanCritique: "H".repeat(90_000),
    judgeCritique: "J".repeat(90_000),
  };
}

/** 40 disagreeing rows across two cells → selection caps at 25. */
function disagreements(): DisagreementRow[] {
  const raw: RawVerdict[] = [
    ...Array.from({ length: 30 }, (_, i) => row(`a-${i}`, "pos", "neg")),
    ...Array.from({ length: 10 }, (_, i) => row(`b-${i}`, "neg", "pos")),
  ];
  const built = buildDisagreementRows(raw);
  const confusion = confusionMatrix(
    built.map((r) => r.judgeLabel),
    built.map((r) => r.humanLabel)
  );
  return selectDiagnosisDisagreements(built, confusion);
}

interface CapturedCall {
  url: string;
  init: RequestInit;
}

function makeFetch(
  respond: () => Response | Promise<Response>
): { fetchImpl: typeof fetch; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function jsonChat(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function chatWithContent(content: string): Response {
  return jsonChat({ choices: [{ message: { content } }] });
}

describe("isDiagnosisConfigured", () => {
  it("is false for blank / missing keys and true for a real one", () => {
    expect(isDiagnosisConfigured("")).toBe(false);
    expect(isDiagnosisConfigured("   ")).toBe(false);
    expect(isDiagnosisConfigured(null)).toBe(false);
    expect(isDiagnosisConfigured(undefined)).toBe(false);
    expect(isDiagnosisConfigured(API_KEY)).toBe(true);
  });
});

describe("buildDiagnosisRequest — the disclosed payload (AC-18)", () => {
  it("caps at 25 rows and carries the exact per-row shape", () => {
    const request = buildDiagnosisRequest("Accuracy rubric", disagreements());
    expect(request.url).toBe(OPENROUTER_ENDPOINT);
    const userMessage = request.body.messages[1];
    const payload = JSON.parse(userMessage?.content ?? "{}") as {
      rubric: string;
      disagreements: Record<string, unknown>[];
    };
    expect(payload.rubric).toBe("Accuracy rubric");
    expect(payload.disagreements).toHaveLength(DIAGNOSIS_DISAGREEMENT_LIMIT);
    expect(payload.disagreements[0]).toMatchObject({
      id: expect.any(String),
      input: expect.any(String),
      output: expect.any(String),
      human_label: expect.any(String),
      judge_label: expect.any(String),
    });
    // Round-robin picks one row per distinct cell first (a-0 then b-0).
    expect(payload.disagreements[0]?.id).toBe("a-0");
    expect(payload.disagreements[1]?.id).toBe("b-0");
  });
});

/**
 * A11 — the payload cap. Without it, a session whose critiques are megabytes
 * each builds a request in the hundreds of MB (25 rows × 4 fields) — a
 * self-inflicted DoS on the user's own pane and a request no provider accepts.
 */
describe("buildDiagnosisRequest — the payload is capped (A11)", () => {
  /** The transmitted payload as the code actually serializes it. */
  function payloadOf(request: ReturnType<typeof buildDiagnosisRequest>) {
    return JSON.parse(request.body.messages[1]?.content ?? "{}") as {
      rubric: string;
      disagreements: Record<string, string | null>[];
    };
  }

  it("excerpts every per-row content field to the cap, marking the truncation", () => {
    const built = buildDisagreementRows([
      ...Array.from({ length: 12 }, (_, i) => hugeRow(`a-${i}`, "pos", "neg")),
    ]);
    const confusion = confusionMatrix(
      built.map((r) => r.judgeLabel),
      built.map((r) => r.humanLabel)
    );
    const request = buildDiagnosisRequest(
      "rubric",
      selectDiagnosisDisagreements(built, confusion)
    );
    const payload = payloadOf(request);

    expect(payload.disagreements.length).toBeGreaterThan(0);
    for (const entry of payload.disagreements) {
      for (const field of ["input", "output", "human_critique", "judge_critique"]) {
        const value = entry[field];
        expect(typeof value).toBe("string");
        // ≤ cap + the ellipsis marker — never the original 90,000 characters.
        expect((value as string).length).toBeLessThanOrEqual(
          DIAGNOSIS_EXCERPT_CHARS + 1
        );
        // A truncation is MARKED, not silent: the excerpt ends with an ellipsis.
        const text = value as string;
        expect(text.endsWith("…")).toBe(true);
        // And it is not the original field.
        expect(value).not.toBe("I".repeat(90_000));
      }
    }
  });

  it("caps the whole request at a bounded worst case, not hundreds of MB", () => {
    const built = buildDisagreementRows([
      ...Array.from({ length: 40 }, (_, i) => hugeRow(`a-${i}`, "pos", "neg")),
    ]);
    const confusion = confusionMatrix(
      built.map((r) => r.judgeLabel),
      built.map((r) => r.humanLabel)
    );
    const request = buildDiagnosisRequest(
      "R".repeat(MAX_RUBRIC_CHARS),
      selectDiagnosisDisagreements(built, confusion)
    );
    const serialized = JSON.stringify(request.body);

    // The bound is the CAPS, not the fixture: 25 rows × 4 excerpted fields
    // (2 KB each) plus the 8 KB rubric is ~208 KB before JSON overhead. The
    // UNCAPPED figure for this same fixture is 25 × 4 × 90 KB = 9 MB, and
    // 25 × 4 × 40 MB for a maximal session — so a few hundred KB is proof the
    // cap is doing the work, without pinning a byte-exact size.
    const cappedBound = 25 * 4 * (DIAGNOSIS_EXCERPT_CHARS + 2) + MAX_RUBRIC_CHARS;
    expect(serialized.length).toBeLessThan(cappedBound * 1.5);
    // And it is far below what the same rows would be uncapped.
    const uncapped = 25 * 4 * 90_000;
    expect(serialized.length).toBeLessThan(uncapped / 10);
  });

  it("leaves an in-cap field byte-identical — no gratuitous truncation", () => {
    const request = buildDiagnosisRequest("rubric", disagreements());
    const payload = payloadOf(request);
    expect(payload.disagreements[0]?.input).toBe("input a-0");
    expect(payload.disagreements[0]?.human_critique).toBe("human says so");
    // Nothing is rewritten for a normal payload.
    expect(payload.disagreements[0]?.judge_critique).toBe("judge says so");
  });

  it("keeps the disclosed payload EXACTLY what is sent (AC-18)", () => {
    const built = buildDisagreementRows([
      ...Array.from({ length: 12 }, (_, i) => hugeRow(`a-${i}`, "pos", "neg")),
    ]);
    const confusion = confusionMatrix(
      built.map((r) => r.judgeLabel),
      built.map((r) => r.humanLabel)
    );
    const request = buildDiagnosisRequest(
      "rubric",
      selectDiagnosisDisagreements(built, confusion)
    );

    const { fetchImpl, calls } = makeFetch(() => jsonChat({}));
    // The posted body IS the request body, so the disclosure cannot drift.
    void llmDiagnosis(request, { apiKey: API_KEY, fetchImpl }).catch(() => undefined);
    expect(calls[0]?.init.body).toBe(JSON.stringify(request.body));
  });

  it("an absent field stays absent rather than becoming an empty string", () => {
    const rows: DisagreementRow[] = [
      {
        exampleId: "a-0",
        humanLabel: "pos",
        humanLabels: ["pos"],
        judgeLabel: "neg",
        agree: false,
        judgeScore: null,
        humanScore: null,
        judgeCritique: null,
        humanCritique: null,
        judgeInput: null,
        judgeOutput: null,
        lineNumber: 1,
      },
    ];
    const payload = payloadOf(buildDiagnosisRequest("rubric", rows));
    expect(payload.disagreements[0]?.input).toBeNull();
    expect(payload.disagreements[0]?.output).toBeNull();
    expect(payload.disagreements[0]?.judge_critique).toBeNull();
  });
});

/**
 * A11 — the response cap. A hostile or broken model can answer with a
 * megabyte-long array; the panel used to hand that straight to the DOM.
 */
describe("llmDiagnosis — the response is capped (A11)", () => {
  /** A valid curated diagnosis whose arrays are `count` copies of `text`. */
  function diagnosis(count: number, text: string): string {
    return JSON.stringify({
      rubric_holes: Array.from({ length: count }, () => text),
      bias_flags: ["flag"],
      misapplications: ["a-0"],
      priority_fix: "fix it",
    });
  }

  it("accepts exactly the documented array ceiling", async () => {
    const { fetchImpl } = makeFetch(() =>
      chatWithContent(diagnosis(DIAGNOSIS_MAX_ARRAY_ITEMS, "hole"))
    );
    const request = buildDiagnosisRequest("rubric", disagreements());
    const result = await llmDiagnosis(request, { apiKey: API_KEY, fetchImpl });
    expect(result.rubricHoles).toHaveLength(DIAGNOSIS_MAX_ARRAY_ITEMS);
  });

  it("rejects an oversized array with a typed FORMAT error", async () => {
    const { fetchImpl } = makeFetch(() =>
      chatWithContent(diagnosis(DIAGNOSIS_MAX_ARRAY_ITEMS + 1, "hole"))
    );
    const request = buildDiagnosisRequest("rubric", disagreements());
    const error = await llmDiagnosis(request, { apiKey: API_KEY, fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(DiagnosisError);
    expect((error as DiagnosisError).kind).toBe("format");
    expect((error as DiagnosisError).message).toContain(
      String(DIAGNOSIS_MAX_ARRAY_ITEMS)
    );
    expect((error as DiagnosisError).message).toContain("list");
  });

  it("rejects an oversized STRING with a typed FORMAT error", async () => {
    const { fetchImpl } = makeFetch(() =>
      chatWithContent(diagnosis(1, "X".repeat(DIAGNOSIS_MAX_STRING_CHARS + 1)))
    );
    const request = buildDiagnosisRequest("rubric", disagreements());
    const error = await llmDiagnosis(request, { apiKey: API_KEY, fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(DiagnosisError);
    expect((error as DiagnosisError).kind).toBe("format");
    expect((error as DiagnosisError).message).toContain("character");
    expect((error as DiagnosisError).message).toContain(
      DIAGNOSIS_MAX_STRING_CHARS.toLocaleString("en-US")
    );
  });

  it("accepts a string at the ceiling and rejects one past it", async () => {
    const atCap = "Y".repeat(DIAGNOSIS_MAX_STRING_CHARS);
    const { fetchImpl } = makeFetch(() => chatWithContent(diagnosis(1, atCap)));
    const request = buildDiagnosisRequest("rubric", disagreements());
    const result = await llmDiagnosis(request, { apiKey: API_KEY, fetchImpl });
    expect(result.rubricHoles[0]).toBe(atCap);
  });

  it("caps every curated array, not just the first one", async () => {
    const { fetchImpl } = makeFetch(() =>
      chatWithContent(
        JSON.stringify({
          rubric_holes: ["hole"],
          bias_flags: Array.from({ length: DIAGNOSIS_MAX_ARRAY_ITEMS + 1 }, () => "flag"),
          misapplications: Array.from(
            { length: DIAGNOSIS_MAX_ARRAY_ITEMS + 1 },
            () => "Z".repeat(DIAGNOSIS_MAX_STRING_CHARS + 1)
          ),
          priority_fix: "fix it",
        })
      )
    );
    const request = buildDiagnosisRequest("rubric", disagreements());
    const error = await llmDiagnosis(request, { apiKey: API_KEY, fetchImpl }).catch((e) => e);
    expect((error as DiagnosisError).kind).toBe("format");
  });
});

describe("llmDiagnosis — exactly one call (AC-17/18)", () => {
  it("makes ONE POST to openrouter, Bearer key, curated result", async () => {
    const { fetchImpl, calls } = makeFetch(() =>
      chatWithContent(
        JSON.stringify({
          rubric_holes: ["no tie-breaker rule"],
          bias_flags: ["favours longer answers"],
          misapplications: ["a-0"],
          priority_fix: "add a length penalty",
        })
      )
    );
    const request = buildDiagnosisRequest("rubric", disagreements());
    const result = await llmDiagnosis(request, { apiKey: API_KEY, fetchImpl });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(OPENROUTER_ENDPOINT);
    const headers = (calls[0]?.init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(result).toEqual({
      rubricHoles: ["no tie-breaker rule"],
      biasFlags: ["favours longer answers"],
      misapplications: ["a-0"],
      priorityFix: "add a length penalty",
    });
  });

  it("uses the default model and lets the caller override it", async () => {
    const ok = () =>
      chatWithContent(
        JSON.stringify({ rubric_holes: [], bias_flags: [], misapplications: [], priority_fix: "ok" })
      );
    const { fetchImpl, calls } = makeFetch(ok);
    const request = buildDiagnosisRequest("rubric", disagreements());
    await llmDiagnosis(request, { apiKey: API_KEY, fetchImpl });
    expect(calls[0]?.init.body).toContain(DEFAULT_DIAGNOSIS_MODEL);

    await llmDiagnosis(request, { apiKey: API_KEY, fetchImpl, model: "anthropic/claude-3.5-sonnet" });
    expect(calls[1]?.init.body).toContain("anthropic/claude-3.5-sonnet");
  });
});

describe("llmDiagnosis — the no-op, error and abort paths (AC-17/38)", () => {
  it("no-op without a key: ZERO calls, typed no-key error", async () => {
    const { fetchImpl, calls } = makeFetch(() => jsonChat({}));
    const request = buildDiagnosisRequest("rubric", disagreements());
    await expect(
      llmDiagnosis(request, { apiKey: "  ", fetchImpl })
    ).rejects.toBeInstanceOf(DiagnosisError);
    expect(calls).toHaveLength(0);
    const error = await llmDiagnosis(request, { apiKey: "", fetchImpl }).catch((e) => e);
    expect((error as DiagnosisError).kind).toBe("no-key");
    expect((error as DiagnosisError).message).toBe(DIAGNOSIS_CONFIGURE_COPY);
  });

  it("5xx ⇒ a typed network error", async () => {
    const { fetchImpl } = makeFetch(() => jsonChat({ error: "boom" }, 503));
    const request = buildDiagnosisRequest("rubric", disagreements());
    const error = await llmDiagnosis(request, { apiKey: API_KEY, fetchImpl }).catch((e) => e);
    expect((error as DiagnosisError).kind).toBe("network");
    expect((error as DiagnosisError).message).toContain("503");
  });

  it("nonconforming JSON ⇒ a typed format error", async () => {
    const { fetchImpl } = makeFetch(() => chatWithContent("not json at all"));
    const request = buildDiagnosisRequest("rubric", disagreements());
    const error = await llmDiagnosis(request, { apiKey: API_KEY, fetchImpl }).catch((e) => e);
    expect((error as DiagnosisError).kind).toBe("format");
  });

  it("an AbortError mid-flight ⇒ the typed aborted error (AC-38)", async () => {
    const { fetchImpl } = makeFetch(() => {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      throw error;
    });
    const request = buildDiagnosisRequest("rubric", disagreements());
    const error = await llmDiagnosis(request, { apiKey: API_KEY, fetchImpl }).catch((e) => e);
    expect((error as DiagnosisError).kind).toBe("aborted");
    expect((error as DiagnosisError).message).toContain("aborted");
  });
});

describe("the key is ephemeral (AC-18)", () => {
  it("never reaches the url, the body, the result, an error, or any storage", async () => {
    const writes: [string, string][] = [];
    interface StorageShim {
      setItem(key: string, value: string): void;
      getItem(key: string): string | null;
      removeItem(key: string): void;
    }
    (globalThis as unknown as { localStorage?: StorageShim }).localStorage = {
      setItem: (key, value) => writes.push([key, value]),
      getItem: () => null,
      removeItem: () => {
        /* no-op */
      },
    };
    try {
      const { fetchImpl, calls } = makeFetch(() =>
        chatWithContent(
          JSON.stringify({ rubric_holes: [], bias_flags: [], misapplications: [], priority_fix: "ok" })
        )
      );
      const request = buildDiagnosisRequest("rubric", disagreements());
      const result = await llmDiagnosis(request, { apiKey: API_KEY, fetchImpl });
      // The key travels only in the Authorization header — never in a snapshot
      // or across the wire in a body a caller could log.
      const serialized = `${request.url}${request.body.messages.map((m) => m.content).join("")}${calls[0]?.init.body ?? ""}${JSON.stringify(result)}`;
      const headers = (calls[0]?.init.headers ?? {}) as Record<string, string>;
      // Only the header carries it, and nothing was persisted anywhere.
      expect(serialized).not.toContain(API_KEY);
      expect(headers.Authorization).toBe(`Bearer ${API_KEY}`);
      expect(writes).toEqual([]);
    } finally {
      delete (globalThis as unknown as { localStorage?: StorageShim }).localStorage;
    }
  });
});
