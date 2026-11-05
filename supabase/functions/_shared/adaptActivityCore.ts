// =============================================================================
// Pure orchestration core for the adapt-activity edge function.
//
// All non-trivial logic lives here so it can be unit-tested under Vitest/Node
// (the function's index.ts stays a thin HTTP glue layer). The canonical AI
// schema is imported via relative path: Vitest/Node resolves it directly, and
// Deno resolves it through the function import map (deno.json) + bundling.
//
// NO URL imports in this file.
// =============================================================================

import {
  parseAiActivity,
  buildAdaptationResult,
} from "../../../src/lib/adaptation/canonical/ai.ts";
import type { AdaptationResult } from "../../../src/lib/adaptation/canonical/schema.ts";
import { latexReaskFits } from "./adaptationPrompt.ts";
import { findLabelOnlyTrueFalseItems } from "./trueFalseGuard.ts";
import { findLatexIssues, repairJsonLatex, latexIssuesToReview, type LatexIssue } from "./latexGuard.ts";
import type { ExtractionIssue } from "../../../src/lib/domain/examIssues.ts";

/** A chat message in the OpenAI-compatible format used by the AI gateway. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Inputs needed to build the AI request body. */
export interface AdaptRequestInput {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  /** Extra messages appended after system+user (used for reask round-trips). */
  extraMessages?: ChatMessage[];
}

/** Shape of the OpenAI-compatible POST body sent to the AI gateway. */
export interface AiRequestBody {
  model: string;
  messages: ChatMessage[];
  response_format: {
    type: "json_schema";
    json_schema: {
      name: string;
      schema: object;
      strict: true;
    };
  };
}

/**
 * Build the POST body for the AI gateway, requesting structured output that
 * conforms to the canonical AI activity JSON Schema.
 */
export function buildRequestBody(
  input: AdaptRequestInput,
  jsonSchema: object,
): AiRequestBody {
  const messages: ChatMessage[] = [
    { role: "system", content: input.systemPrompt },
    { role: "user", content: input.userPrompt },
    ...(input.extraMessages ?? []),
  ];

  return {
    model: input.model,
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "adapted_activity",
        schema: jsonSchema,
        strict: true,
      },
    },
  };
}

export type InterpretSuccess = {
  ok: true;
  result: AdaptationResult;
  /** Formulas KaTeX still cannot show after the deterministic repair (C-10). The document is otherwise valid. */
  latexIssues: LatexIssue[];
  /** What the repair fixed (a JSON escape that ate a backslash, a raw %): for the log (C-12). */
  repairedLatex: string[];
};
export type InterpretFailure = { ok: false; errors: string[] };
export type InterpretResult = InterpretSuccess | InterpretFailure;

/**
 * Parse and validate the raw model output into a canonical AdaptationResult.
 *
 * Failure modes (all returned as `{ ok: false, errors }`, never thrown):
 *  - the content is not valid JSON;
 *  - the JSON does not satisfy the AI activity schema;
 *  - normalization/domain validation rejects the document;
 *  - a trueFalse question lists the V/F options as its items (trueFalseGuard).
 *
 * A formula KaTeX cannot show is NOT a failure here: the document is returned with
 * `latexIssues`, and the caller decides (reask once, then deliver with a notice; C-10).
 */
export function interpretAiResponse(rawContent: string): InterpretResult {
  let json: unknown;
  try {
    json = JSON.parse(rawContent);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "unknown error";
    return { ok: false, errors: [`Invalid JSON from model: ${reason}`] };
  }

  // C-12/C-18: a `\frac` that arrived as FF + "rac", a raw `%`. Repaired before the schema sees it.
  const repaired = repairJsonLatex(json);

  const parsed = parseAiActivity(repaired.json);
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors };
  }

  try {
    const result = buildAdaptationResult(parsed.value);
    const trueFalseErrors = findLabelOnlyTrueFalseItems(result);
    if (trueFalseErrors.length > 0) return { ok: false, errors: trueFalseErrors };
    return { ok: true, result, latexIssues: findLatexIssues(result), repairedLatex: repaired.repairs };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "unknown error";
    return { ok: false, errors: [`Document validation failed: ${reason}`] };
  }
}

/**
 * Build the reask message appended to the conversation when the model's output
 * failed validation. It restates the exact validation errors so the model can
 * correct its next attempt.
 */
export function nextReaskMessage(errors: string[]): ChatMessage {
  const list = errors.map((e) => `- ${e}`).join("\n");
  return {
    role: "user",
    content:
      "Sua resposta anterior não passou na validação do schema. " +
      "Corrija EXATAMENTE os seguintes problemas e responda novamente apenas com o JSON válido:\n" +
      list,
  };
}

/**
 * Build the pair of messages to append for a reask round-trip.
 *
 * Appending the model's raw (failed) output as an assistant turn is required so
 * the model has full context of what it produced before being asked to fix it.
 * The conversation structure becomes:
 *   [system, user(original), ..., assistant(bad_json), user(fix errors), ...]
 */
export function buildReaskMessages(
  rawContent: string,
  errors: string[],
): ChatMessage[] {
  return [
    { role: "assistant", content: rawContent },
    nextReaskMessage(errors),
  ];
}

/**
 * Latex problems get ONE reask, inside the existing attempt loop, and only if it still fits
 * before the delivery deadline (a reask costs 60 to 120 s and the gateway cuts at 150 s: L7-1).
 * The attempt must also have a next attempt.
 */
export function shouldReaskForLatex(
  issueCount: number,
  attempt: number,
  maxAttempts: number,
  alreadyReaskedForLatex: boolean,
  elapsedMs: number,
): boolean {
  return issueCount > 0 && attempt < maxAttempts && !alreadyReaskedForLatex && latexReaskFits(elapsedMs);
}

/** Of two valid candidates, the one with fewer unshowable formulas; a tie goes to the newer one. */
export function betterCandidate<T extends { latexIssues: unknown[] }>(previous: T | null, next: T): T {
  return previous && previous.latexIssues.length < next.latexIssues.length ? previous : next;
}

/**
 * The result as it is stored and returned: the notices ride along as an optional sibling of
 * `document` so they survive a reopen (L9A-4). Additive: with nothing to say the result is
 * returned as is, with no key, exactly as before.
 */
export function withReviewIssues(result: AdaptationResult, issues: ExtractionIssue[]): AdaptationResult {
  return issues.length > 0 ? { ...result, review_issues: issues } : result;
}

/** The per-question notices for the formulas that stayed invalid (C-10). Informational. */
export function latexReviewIssues(result: AdaptationResult, issues: LatexIssue[]): ExtractionIssue[] {
  const questions = (result.document.blocks as Array<{ type?: string }>).filter((b) => b?.type === "question").length;
  return latexIssuesToReview(issues, questions);
}
