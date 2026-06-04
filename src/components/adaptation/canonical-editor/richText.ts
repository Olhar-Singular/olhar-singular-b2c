/**
 * Display helper: flatten a canonical `RichText` into a plain string for the
 * simple `<input>`-based answer editors. Inline math is rendered as a `$latex$`
 * token so it survives a round-trip through the plain-text editing surface.
 *
 * (The full rich-text editing happens in the question stem via ProseMirror;
 * answer alternatives use lightweight plain inputs.)
 */

import type { RichText } from "@/lib/adaptation/canonical/schema";

export function richTextToPlain(rich: RichText | undefined): string {
  if (!rich) return "";
  return rich
    .map((node) => (node.type === "inlineMath" ? `$${node.latex}$` : node.text))
    .join("");
}
