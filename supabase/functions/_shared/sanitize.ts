/**
 * Neutralize HTML-sensitive characters by ESCAPING them as HTML entities,
 * not deleting them. Deleting `< > & " '` corrupts legitimate content such as
 * inequalities (`x < 5`), boolean/set expressions (`a & b`) and ordered pairs
 * (`2 < x < 5`). Escaping keeps the information while making any markup inert,
 * so a `<script>` becomes `&lt;script&gt;` (rendered as text, never executed).
 *
 * `&` is escaped first so the `&` introduced by the other replacements is not
 * re-escaped. The length cap is applied AFTER escaping and counts the escaped
 * output.
 *
 * Because the cap lands on the ESCAPED string, the cut can fall inside an
 * entity and leave `&am` behind — a fragment the model happily copies into the
 * adapted worksheet. A trailing half-entity is therefore dropped whole.
 *
 * The cap itself is mirrored on the client (`src/lib/domain/activityLimits.ts`)
 * so the wizard can warn BEFORE spending a credit on text that would be cut;
 * a sync test in adaptationPrompt.test.ts keeps the two honest.
 */
const DANGLING_ENTITY = /&[a-z0-9#]*$/i;

export function sanitize(input: string, maxLength = 5000): string {
  const escaped = input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  if (escaped.length <= maxLength) return escaped.trim();
  return escaped.slice(0, maxLength).replace(DANGLING_ENTITY, "").trim();
}
