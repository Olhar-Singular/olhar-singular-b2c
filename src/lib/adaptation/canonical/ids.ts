/** Stable node id utilities for the canonical document schema. */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Generate a new random UUID. */
export function newId(): string {
  return crypto.randomUUID();
}

/** Type guard — returns true only for valid UUID strings. */
export function isId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
