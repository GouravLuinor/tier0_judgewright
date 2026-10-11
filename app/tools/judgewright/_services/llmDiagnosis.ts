/**
 * Judgewright — the OPTIONAL opt-in BYOK LLM diagnosis (AC-17/18/38, FM-16).
 *
 * WHY `_services`, NOT `_lib` (the BAR §8 exception, documented in AGENTS.md §25):
 * `_lib` is pure — no fetch, no IO. This module makes exactly ONE network call,
 * so it cannot live in the pure core. It is the single IO-yielding adapter in
 * the tool, it is OFF by default (`AUTO_DIAGNOSIS_ENABLED` is false), and it is
 * EPHEMERAL: nothing is ever persisted, and the API key never enters any store
 * snapshot or localStorage — it is held in the panel's memory for one request
 * and gone on reload.
 *
 * The call is a single POST to OpenRouter (already whitelisted in connect-src)
 * with a Bearer key the user supplies. It is fully injectable — `fetchImpl`,
 * `model` and `signal` are parameters — so the whole flow is testable without a
 * network or a real key.
 *
 * A11 — the payload is CAPPED IN BOTH DIRECTIONS, because the input and the
 * output are both untrusted at the "260 MB request / frozen pane" scale:
 *   · REQUEST: a judge session may legally carry multi-megabyte critique /
 *     input / output cells, and 25 rows × 4 such fields is a request in the
 *     hundreds of MB. Every per-row field is therefore excerpted to
 *     `DIAGNOSIS_EXCERPT_CHARS`, and the disclosed payload is built from the
 *     SAME excerpted rows, so "What we send" shows what is really sent.
 *   · RESPONSE: a hostile or broken model can answer with a megabyte-long
 *     array of strings. `parseDiagnosis` refuses anything past
 *     `DIAGNOSIS_MAX_ARRAY_ITEMS` entries or `DIAGNOSIS_MAX_STRING_CHARS` per
 *     string with a typed `format` error, rather than handing the pane a
 *     payload that freezes it while it renders.
 */

import {
  DIAGNOSIS_DISAGREEMENT_LIMIT,
  DIAGNOSIS_EXCERPT_CHARS,
  DIAGNOSIS_MAX_ARRAY_ITEMS,
  DIAGNOSIS_MAX_STRING_CHARS,
} from "../_lib/constants.ts";
import { selectDiagnosisDisagreements } from "../_lib/disagreements.ts";
import type { DisagreementRow } from "../_lib/types.ts";

// Re-exported for proximity: the round-robin selection the request is built on.
export { selectDiagnosisDisagreements };

/** The one OpenRouter endpoint the tool ever contacts. */
export const OPENROUTER_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";

/** The default model; overridable per call (BYOK keeps it user-chosen). */
export const DEFAULT_DIAGNOSIS_MODEL = "openai/gpt-4o-mini";

/** The outcome the panel states under its header, verbatim. */
export const DIAGNOSIS_ONE_CALL_COPY =
  "One request is sent when you press Get diagnosis — and only then. Nothing here is logged, stored or sent anywhere else.";

/** The copy when no key has been configured: a clean no-op. */
export const DIAGNOSIS_CONFIGURE_COPY =
  "The diagnosis is optional. Add an OpenRouter API key to enable it — with no key it does nothing and sends nothing.";

/** The copy after an abort (AC-38). */
export const DIAGNOSIS_ABORT_COPY =
  "Diagnosis aborted — nothing was sent or stored.";

export type DiagnosisErrorKind = "no-key" | "network" | "format" | "aborted";

/**
 * A TYPED error for every documented failure mode (errors are values here —
 * the panel reads `error.kind` to pick its state). Never leaks verbatim
 * exception text (AGENTS §24).
 */
export class DiagnosisError extends Error {
  readonly kind: DiagnosisErrorKind;
  constructor(kind: DiagnosisErrorKind, message: string) {
    super(message);
    this.name = "DiagnosisError";
    this.kind = kind;
  }
}

/**
 * A11 — excerpt one transmitted field to `DIAGNOSIS_EXCERPT_CHARS`, marking a
 * truncation with a single ellipsis so the receipt is honest about it. Absent
 * fields stay absent (never the empty string) and short fields are untouched,
 * so a normal payload is byte-identical to what it always was.
 */
function excerptField(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value.length <= DIAGNOSIS_EXCERPT_CHARS) return value;
  return `${value.slice(0, DIAGNOSIS_EXCERPT_CHARS)}…`;
}

/** One disagreement row as it appears in the transmitted payload. */
export interface DiagnosisDisagreement {
  id: string;
  input: string | null;
  output: string | null;
  human_label: string;
  human_critique?: string | null;
  judge_label: string;
  judge_critique?: string | null;
}

/** The settled shape the panel shows the user. */
export interface DiagnosisResult {
  rubricHoles: string[];
  biasFlags: string[];
  misapplications: string[];
  priorityFix: string;
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatRequestBody {
  model: string;
  messages: ChatMessage[];
}

/** The request descriptor `buildDiagnosisRequest` returns and `llmDiagnosis` posts. */
export interface DiagnosisHttpRequest {
  url: string;
  body: ChatRequestBody;
}

export interface DiagnosisOptions {
  apiKey: string;
  /** Override the default model. */
  model?: string;
  /** Injected fetch (tests); defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Mid-flight abort signal (AC-38). */
  signal?: AbortSignal;
}

/** AC-17: with no (blank) key the flow is a no-op that never fires a request. */
export function isDiagnosisConfigured(
  apiKey: string | null | undefined
): boolean {
  return typeof apiKey === "string" && apiKey.trim().length > 0;
}

const SYSTEM_INSTRUCTION =
  "You are a calibration auditor reviewing an LLM judge. You are given a rubric and up to 25 disagreement rows where a judge's label differed from a human reference. Respond with ONLY a JSON object with these exact keys: " +
  '{"rubric_holes": string[], "bias_flags": string[], "misapplications": string[], "priority_fix": string}. ' +
  "rubric_holes: places the rubric is ambiguous or silent. bias_flags: length/position/self-preference patterns you observe. misapplications: rows where the rubric read correctly still points the wrong way. priority_fix: the single highest-leverage change. No prose outside the JSON.";

/**
 * Builds the single request. `disagreements` are capped at
 * `DIAGNOSIS_DISAGREEMENT_LIMIT` (25) — the round-robin selection that produced
 * them lives in `selectDiagnosisDisagreements`; this function maps them to the
 * disclosed payload (id / input / output / human + judge label + critique) and
 * wraps them with the rubric. Everything in `body.messages` is EXACTLY what the
 * user is shown under "What we send".
 */
export function buildDiagnosisRequest(
  rubric: string,
  disagreements: readonly DisagreementRow[]
): DiagnosisHttpRequest {
  // A11: every content field is excerpted. The rows were already capped at
  // DIAGNOSIS_DISAGREEMENT_LIMIT (25) by the round-robin selection; this bounds
  // each FIELD, so the worst-case request is 25 × 4 × 2 KB ≈ 200 KB instead of
  // 25 × 4 × 40 MB.
  const payload: DiagnosisDisagreement[] = disagreements
    .slice(0, DIAGNOSIS_DISAGREEMENT_LIMIT)
    .map((row) => ({
      id: row.exampleId,
      input: excerptField(row.judgeInput),
      output: excerptField(row.judgeOutput),
      human_label: row.humanLabel,
      human_critique: excerptField(row.humanCritique),
      judge_label: row.judgeLabel,
      judge_critique: excerptField(row.judgeCritique),
    }));
  const userContent = JSON.stringify({ rubric, disagreements: payload }, null, 2);
  return {
    url: OPENROUTER_ENDPOINT,
    body: {
      model: DEFAULT_DIAGNOSIS_MODEL,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: userContent },
      ],
    },
  };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/**
 * Parses + validates the curated diagnosis JSON. The coordinator's required
 * shape is {rubric_holes, bias_flags, misapplications, priority_fix}; anything
 * else is a `format` error, never a fabricated panel (FM-12).
 */
function parseDiagnosis(content: unknown): DiagnosisResult {
  let parsed: unknown = content;
  if (typeof content === "string") {
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new DiagnosisError("format", "The diagnosis response was not valid JSON.");
    }
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new DiagnosisError("format", "The diagnosis response was not an object.");
  }
  const obj = parsed as Record<string, unknown>;
  // A11: the response is capped in BOTH dimensions. An oversized array or an
  // oversized string is a `format` error — the same typed value the panel
  // already renders for nonconforming JSON — rather than a payload that
  // reaches the DOM (and the user's patience) at attacker-chosen size.
  const asStringArray = (value: unknown): string[] | null => {
    if (!Array.isArray(value)) return null;
    if (value.length > DIAGNOSIS_MAX_ARRAY_ITEMS) {
      throw new DiagnosisError(
        "format",
        `The diagnosis response listed ${value.length} items — the limit is ${DIAGNOSIS_MAX_ARRAY_ITEMS}.`
      );
    }
    for (const item of value) {
      if (typeof item !== "string") return null;
      if (item.length > DIAGNOSIS_MAX_STRING_CHARS) {
        throw new DiagnosisError(
          "format",
          `The diagnosis response carried a ${item.length.toLocaleString("en-US")}-character item — the limit is ${DIAGNOSIS_MAX_STRING_CHARS.toLocaleString("en-US")}.`
        );
      }
    }
    return value as string[];
  };
  const rubricHoles = asStringArray(obj.rubric_holes);
  const biasFlags = asStringArray(obj.bias_flags);
  const misapplications = asStringArray(obj.misapplications);
  const priorityFix = typeof obj.priority_fix === "string" ? obj.priority_fix : null;
  if (rubricHoles === null || biasFlags === null || misapplications === null || priorityFix === null) {
    throw new DiagnosisError(
      "format",
      "The diagnosis JSON was missing the curated fields (rubric_holes, bias_flags, misapplications, priority_fix)."
    );
  }
  return { rubricHoles, biasFlags, misapplications, priorityFix };
}

/**
 * Makes EXACTLY ONE POST to OpenRouter and returns the curated diagnosis, or a
 * typed `DiagnosisError` for every documented failure: no-key (no request is
 * fired), network (5xx), format (nonconforming JSON), aborted (mid-flight
 * AbortError). Off by default; the panel is the only caller.
 */
export async function llmDiagnosis(
  request: DiagnosisHttpRequest,
  options: DiagnosisOptions
): Promise<DiagnosisResult> {
  if (!isDiagnosisConfigured(options.apiKey)) {
    throw new DiagnosisError("no-key", DIAGNOSIS_CONFIGURE_COPY);
  }
  const fetchFn: typeof fetch = options.fetchImpl ?? fetch;
  const payload: ChatRequestBody = { ...request.body, model: options.model ?? request.body.model };

  let response: Response;
  try {
    response = await fetchFn(request.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new DiagnosisError("aborted", DIAGNOSIS_ABORT_COPY);
    }
    throw new DiagnosisError("network", "The diagnosis request could not reach the service.");
  }

  if (!response.ok) {
    throw new DiagnosisError("network", `The diagnosis service returned HTTP ${response.status}.`);
  }

  let content: unknown;
  try {
    const json = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    content = json?.choices?.[0]?.message?.content;
  } catch {
    throw new DiagnosisError("format", "The diagnosis response was not valid JSON.");
  }
  return parseDiagnosis(content);
}
