/**
 * Pure helpers shared by the NodeView components. Kept in a non-component module
 * so the React Fast-Refresh lint rule stays happy and the logic stays unit-testable.
 */

import { renderLatexToHtml } from "@/lib/domain/latexRenderer";

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
