/**
 * JSON Schema export for the AI structured-output contract.
 * Uses zod-to-json-schema with inlined $refs so the schema is grammar-friendly
 * for Gemini and other LLM providers.
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import { AdaptationResultSchema } from "./schema";

/**
 * Returns the JSON Schema (OpenAPI 3.0 dialect) for AdaptationResult.
 * All $refs are inlined (no external references) to keep the schema
 * self-contained for use as a structured-output grammar.
 *
 * A new plain object is returned on each call.
 */
export function documentResultJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(AdaptationResultSchema, {
    target: "openApi3",
    $refStrategy: "none",
  }) as Record<string, unknown>;
}
