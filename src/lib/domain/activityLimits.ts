/**
 * Size limit of the activity text sent to `adapt-activity`.
 *
 * The edge function sanitizes the input by ESCAPING HTML and then truncating to
 * `MAX_ACTIVITY_CHARS` (see supabase/functions/_shared/sanitize.ts). That cut is
 * silent: a teacher who pasted a long exam paid the credits and got back half a
 * worksheet with nothing on screen to explain why. The wizard therefore has to
 * measure the same length the server will and refuse to spend a credit on text
 * that cannot arrive whole.
 *
 * The constant is DUPLICATED in the edge function (which runs under Deno and
 * avoids bundling `src/`), exactly like the credit tables in
 * `supabase/functions/_shared/adaptationCost.ts`. A sync test over there imports
 * both and asserts they are equal, so they cannot drift.
 */

/** Max length, in ESCAPED characters, of the activity text the server accepts. */
export const MAX_ACTIVITY_CHARS = 15000;

/**
 * Length of `text` after the server's HTML escaping — the number the truncation
 * actually applies to. Counting raw characters would under-report: a single `<`
 * becomes four characters and `&` becomes five, so an entity-heavy document
 * passes a raw-length check and still comes back cut.
 *
 * Mirrors `sanitize()`: escape `&` first (so the ampersands the other
 * replacements introduce are not re-escaped), then trim.
 */
export function escapedLength(text: string): number {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .trim().length;
}

/** Whether the activity text would be truncated by the server. */
export function isActivityOverLimit(text: string): boolean {
  return escapedLength(text) > MAX_ACTIVITY_CHARS;
}
