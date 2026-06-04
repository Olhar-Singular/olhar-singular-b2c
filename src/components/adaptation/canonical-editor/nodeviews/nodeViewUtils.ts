/**
 * Pure helpers shared by the NodeView components. Kept in a non-component module
 * so the React Fast-Refresh lint rule stays happy and the logic stays unit-testable.
 */

import type { RichText } from "@/lib/adaptation/canonical/schema";
import { renderLatexToHtml } from "@/lib/domain/latexRenderer";

/** Parse a numeric input value to a positive number or null. */
export function parsePositiveNumber(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Build a RichText caption from a plain string (empty -> undefined). */
export function captionFromPlain(text: string): RichText | undefined {
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
