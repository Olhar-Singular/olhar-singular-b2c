/**
 * Pure helpers shared by the NodeView components. Kept in a non-component module
 * so the React Fast-Refresh lint rule stays happy and the logic stays unit-testable.
 */

import type { RichText } from "@/lib/adaptation/canonical/schema";
import { renderLatexToHtml } from "@/lib/domain/latexRenderer";
import { richTextToPlain } from "../richText";

/** Parse a numeric input value to a positive number or null. */
export function parsePositiveNumber(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
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
