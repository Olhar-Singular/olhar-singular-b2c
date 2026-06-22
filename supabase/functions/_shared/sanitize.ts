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
 */
export function sanitize(input: string, maxLength = 5000): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .slice(0, maxLength)
    .trim();
}
