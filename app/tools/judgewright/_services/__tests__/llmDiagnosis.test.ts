import { describe, expect, it } from "vitest";
import { buildDisagreementRows } from "../../_lib/disagreements.ts";
import { confusionMatrix } from "../../_lib/confusionMatrix.ts";
import { DIAGNOSIS_DISAGREEMENT_LIMIT } from "../../_lib/constants.ts";
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
