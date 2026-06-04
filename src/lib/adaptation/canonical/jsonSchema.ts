/**
 * JSON Schema export for the AI structured-output contract.
 * Uses zod-to-json-schema with $refStrategy:"root" so recursive fields
 * (question.stem, alternative.nested) are preserved via $ref:"#" instead of
 * degrading to unconstrained `{}` and emitting a console.warn.
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import { AdaptationResultSchema } from "./schema";

/**
 * Returns the JSON Schema (OpenAPI 3.0 dialect) for AdaptationResult.
 * Recursive references are represented as $ref:"#" (root self-reference),
 * keeping the schema self-contained and grammar-valid for structured-output
 * providers (Gemini, OpenAI, etc.).
 *
 * A new plain object is returned on each call.
 */
export function documentResultJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(AdaptationResultSchema, {
    target: "openApi3",
    $refStrategy: "root",
  }) as Record<string, unknown>;
}
