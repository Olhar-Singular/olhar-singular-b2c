/**
 * Pure mapping from a canonical per-node `NodeStyle` to a react-pdf `Style`
 * object — the PDF analogue of `nodeStyleToCss`. Mirrors the same mapping
 * intent (fontFamily, fontSize, align, color, spacingAfter, pageBreakBefore)
 * but emits react-pdf style keys instead of CSS strings.
 *
 * Allowlist-safe: only known fields are emitted, and `color` is validated
 * against the document palette (same guard as the screen renderer).
 *
 * Note: `pageBreakBefore` is NOT a react-pdf style key — pagination is driven
 * by the `break` prop on a Page child. `pageBreakBefore` exposes that intent so
 * the block mapper can set the prop on the wrapping element.
 */

import type { Style } from "@react-pdf/types";
import type { NodeStyle } from "@/lib/adaptation/canonical/schema";
import { isAllowedColor } from "@/lib/adaptation/canonical/colors";
import { fontFamilyToPdf } from "@/lib/adaptation/canonical/fontFamily";

export function nodeStyleToPdf(style?: NodeStyle): Style {
  const out: Style = {};
  if (!style) return out;

  if (style.fontFamily !== undefined) out.fontFamily = fontFamilyToPdf(style.fontFamily);
  if (style.fontSize !== undefined) out.fontSize = style.fontSize;
  if (style.align !== undefined) out.textAlign = style.align;
  if (style.color !== undefined && isAllowedColor(style.color)) out.color = style.color;
  if (style.spacingAfter !== undefined) out.marginBottom = style.spacingAfter;

  return out;
}

/** Whether a node requests a page break before it (drives react-pdf `break`). */
export function pageBreakBefore(style?: NodeStyle): boolean {
  return style?.pageBreakBefore === true;
}
