/**
 * Validation wrappers for the canonical document schema.
 * Converts Zod errors into human-readable "<path>: <message>" strings.
 */

import { z } from "zod";
import { CanonicalDocumentSchema } from "./schema.ts";
import type { CanonicalDocument } from "./schema.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SafeParseSuccess = {
  ok: true;
  value: CanonicalDocument;
};

export type SafeParseFailure = {
  ok: false;
  errors: string[];
};

export type SafeParseResult = SafeParseSuccess | SafeParseFailure;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Format a ZodError's issues into readable "<path>: <message>" strings. */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path =
      issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse an unknown value as a CanonicalDocument.
 * Returns `{ ok: true, value }` on success or `{ ok: false, errors }` on failure.
 * Never throws.
 */
export function safeParseDocument(input: unknown): SafeParseResult {
  const result = CanonicalDocumentSchema.safeParse(input);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, errors: formatIssues(result.error) };
}

/**
 * Parse an unknown value as a CanonicalDocument.
 * Returns the typed document on success; throws with a descriptive message on failure.
 */
export function validateDocument(input: unknown): CanonicalDocument {
  const result = CanonicalDocumentSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const messages = formatIssues(result.error);
  throw new Error(`Invalid CanonicalDocument:\n${messages.join("\n")}`);
}
