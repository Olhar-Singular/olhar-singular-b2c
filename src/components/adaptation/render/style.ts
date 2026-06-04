/**
 * Pure mapping from a canonical per-node `NodeStyle` to a React
 * `CSSProperties`. Allowlist-safe: only the known style fields are emitted, and
 * `color` is validated against the document palette to prevent CSS injection.
 */

import type { CSSProperties } from "react";
import type { NodeStyle } from "@/lib/adaptation/canonical/schema";
import { isAllowedColor } from "@/lib/adaptation/canonical/colors";

export function nodeStyleToCss(style?: NodeStyle): CSSProperties {
  const css: CSSProperties = {};
  if (!style) return css;

  if (style.fontFamily !== undefined) css.fontFamily = style.fontFamily;
  if (style.fontSize !== undefined) css.fontSize = `${style.fontSize}px`;
  if (style.align !== undefined) css.textAlign = style.align;
  if (style.color !== undefined && isAllowedColor(style.color)) css.color = style.color;
  if (style.spacingAfter !== undefined) css.marginBottom = `${style.spacingAfter}px`;
  if (style.pageBreakBefore) css.breakBefore = "page";

  return css;
}
