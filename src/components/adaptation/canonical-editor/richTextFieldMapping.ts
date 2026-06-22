/**
 * Pure RichText <-> single-paragraph ProseMirror doc mapping for `RichTextField`.
 *
 * Kept in a non-component module so the helpers stay unit-testable and the React
 * Fast-Refresh lint rule stays happy. The actual inline mapping reuses the
 * proven, round-trip-tested `richTextToPM` / `pmToRichText` mappers.
 */

import type { RichText } from "@/lib/adaptation/canonical/schema";
import { richTextToPM, type PMNode } from "@/lib/adaptation/tiptap/fromCanonical";
import { pmToRichText } from "@/lib/adaptation/tiptap/toCanonical";

/** Build the PM doc JSON that seeds the editor from a RichText value. */
export function docFromRichText(value: RichText): PMNode {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: richTextToPM(value) }],
  };
}

/** Read the single paragraph's inline content from a PM doc JSON. */
export function richTextFromDoc(docJSON: PMNode): RichText {
  const paragraph = docJSON.content?.[0];
  return pmToRichText(paragraph?.content);
}

/** Deep structural equality for two RichText values. */
export function richTextEqual(a: RichText, b: RichText): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
