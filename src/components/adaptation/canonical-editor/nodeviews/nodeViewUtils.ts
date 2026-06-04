/**
 * Pure helpers shared by the NodeView components. Kept in a non-component module
 * so the React Fast-Refresh lint rule stays happy and the logic stays unit-testable.
 */

import type { RichText } from "@/lib/adaptation/canonical/schema";
import { renderMathToHtml } from "@/lib/domain/latexRenderer";

/** Parse a numeric input value to a positive number or null. */
export function parsePositiveNumber(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Build a RichText caption from a plain string (empty -> undefined). */
export function captionFromPlain(text: string): RichText | undefined {
  return text === "" ? undefined : [{ type: "text", text }];
}

/** Render a latex string to KaTeX HTML (wrapped in `$…$` for the renderer). */
export function latexToHtml(latex: string): string {
  return renderMathToHtml(`$${latex}$`);
}
