/**
 * resolvePageStyle — turns the optional, persisted `pageStyle` (plano §7.1) into
 * a fully-resolved set of values both renderers (screen CSS + PDF) consume.
 *
 * `fontSize` (pt) and `blockSpacing` (px) get concrete defaults that match the
 * CURRENT hardcoded behaviour, so a document without `pageStyle` renders exactly
 * as before. `fontFamily` stays `undefined` when absent — i.e. NO document-level
 * font override — so the sheet keeps inheriting the app font and the PDF keeps
 * its built-in default. A concrete font (e.g. Lexend) only applies once the
 * teacher picks one in the Aparência popover.
 */
import { BASE_FONT_PT, BASE_BLOCK_SPACING_PX } from "./pageTokens";
import type { PageStyle, ElementFontSizes } from "@/lib/adaptation/canonical/schema";

export type ResolvedPageStyle = {
  /** Font token (fontFamily.ts) or undefined for "no override". */
  fontFamily: string | undefined;
  /** Base font size in pt. */
  fontSize: number;
  /** Default gap between top-level blocks, in px. */
  blockSpacing: number;
  /** Per-element font-size overrides in pt. Absent keys inherit the global fontSize. */
  elementFontSizes?: ElementFontSizes;
};

export const PAGE_STYLE_DEFAULTS: ResolvedPageStyle = {
  fontFamily: undefined,
  fontSize: BASE_FONT_PT,
  blockSpacing: BASE_BLOCK_SPACING_PX,
};

export function resolvePageStyle(ps?: PageStyle): ResolvedPageStyle {
  return {
    fontFamily: ps?.fontFamily ?? PAGE_STYLE_DEFAULTS.fontFamily,
    fontSize: ps?.fontSize ?? PAGE_STYLE_DEFAULTS.fontSize,
    blockSpacing: ps?.blockSpacing ?? PAGE_STYLE_DEFAULTS.blockSpacing,
    ...(ps?.elementFontSizes !== undefined ? { elementFontSizes: ps.elementFontSizes } : {}),
  };
}
