/**
 * Pure helpers shared by the NodeView components. Kept in a non-component module
 * so the React Fast-Refresh lint rule stays happy and the logic stays unit-testable.
 */

import type { RichText } from "@/lib/adaptation/canonical/schema";
import { renderLatexToHtml } from "@/lib/domain/latexRenderer";
import { richTextToPlain } from "../richText";

/**
 * Minimal structural view of a ProseMirror doc node — just enough for
 * `questionOrdinal` to walk it without importing prosemirror-model types.
 */
export interface OrdinalDoc {
  descendants(fn: (node: { type: { name: string } }, pos: number) => void): void;
}

/**
 * Compute the 1-based ordinal of the question node at `pos` among all question
 * nodes in the document, in document order. The displayed question number is
 * derived purely from position — questions carry no stored `number` field.
 *
 * Counts question nodes whose position is strictly before `pos`, then adds 1.
 */
export function questionOrdinal(doc: OrdinalDoc, pos: number): number {
  let before = 0;
  doc.descendants((node, nodePos) => {
    if (node.type.name === "question" && nodePos < pos) before += 1;
  });
  return before + 1;
}

/**
 * Resolve the new caption RichText from a plain-text input.
 *
 * The caption input renders `existing` via `richTextToPlain`. When the typed
 * text equals the flattened plain text of the current caption, the visible text
 * did not change (e.g. focus/blur or editing a sibling field) — so we PRESERVE
 * the existing RichText (marks/color/inlineMath) instead of flattening it. Only
 * a real visible-text change flattens; empty text clears the caption.
 */
export function captionFromPlain(existing: RichText | undefined, text: string): RichText | undefined {
  if (existing !== undefined && richTextToPlain(existing) === text) return existing;
  return text === "" ? undefined : [{ type: "text", text }];
}

/**
 * Render a bare latex string to KaTeX HTML in display mode — the SAME engine
 * and display mode the read-only renderer (`BlockMathView`) uses, so the editor
 * preview can never diverge from the final render.
 */
export function latexToHtml(latex: string): string {
  return renderLatexToHtml(latex, true);
}

/**
 * Render a bare latex string to inline KaTeX HTML — the SAME engine and (inline)
 * display mode the read-only renderer (`RichTextView`) uses for inlineMath runs.
 */
export function inlineLatexToHtml(latex: string): string {
  return renderLatexToHtml(latex, false);
}
