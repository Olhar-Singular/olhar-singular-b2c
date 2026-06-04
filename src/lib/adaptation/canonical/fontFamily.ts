/**
 * Logical font-family tokens for the canonical document schema.
 *
 * The styling picker stores ONE of these logical tokens in `style.fontFamily`
 * (instead of a concrete font name). Both renderers map the SAME token through
 * this single source of truth so the screen (CSS) and the PDF (@react-pdf) can
 * never silently diverge:
 *
 *   - `nodeStyleToCss`  → a CSS font stack       (`fontFamilyToCss`)
 *   - `nodeStyleToPdf`  → a @react-pdf built-in  (`fontFamilyToPdf`)
 *
 * @react-pdf/renderer only ships three built-in families (Helvetica /
 * Times-Roman / Courier) and we never call `Font.register`, so the logical set
 * is deliberately restricted to three tokens that map cleanly to both worlds.
 *
 * FUTURE: custom/accessibility fonts (e.g. OpenDyslexic) require
 * `Font.register(...)` in `render/pdf/` with a bundled font asset before they
 * can be offered here without the PDF silently falling back to a built-in.
 */

/** The logical font tokens stored in `NodeStyle.fontFamily`. */
export const FONT_FAMILY_TOKENS = ["sans", "serif", "mono"] as const;

export type FontFamilyToken = (typeof FONT_FAMILY_TOKENS)[number];

/** Human-readable labels (pt-BR) for the styling picker. */
export const FONT_FAMILY_OPTIONS: { value: FontFamilyToken; label: string }[] = [
  { value: "sans", label: "Padrão" },
  { value: "serif", label: "Serifada" },
  { value: "mono", label: "Monoespaçada" },
];

const CSS_STACKS: Record<FontFamilyToken, string> = {
  sans: "Helvetica, Arial, sans-serif",
  serif: "Times New Roman, Times, serif",
  mono: "Courier New, Courier, monospace",
};

/** The matching @react-pdf built-in family for each token. */
const PDF_FAMILIES: Record<FontFamilyToken, string> = {
  sans: "Helvetica",
  serif: "Times-Roman",
  mono: "Courier",
};

/** True when `v` is one of the three logical font tokens. */
export function isFontFamilyToken(v: unknown): v is FontFamilyToken {
  return typeof v === "string" && (FONT_FAMILY_TOKENS as readonly string[]).includes(v);
}

/**
 * Map a logical token to a CSS font stack. Unknown values (e.g. a legacy
 * concrete font name) are passed through unchanged so existing documents keep
 * rendering with whatever they had.
 */
export function fontFamilyToCss(value: string): string {
  return isFontFamilyToken(value) ? CSS_STACKS[value] : value;
}

/**
 * Map a logical token to a @react-pdf built-in family. Unknown values are
 * passed through unchanged (matching `fontFamilyToCss`).
 */
export function fontFamilyToPdf(value: string): string {
  return isFontFamilyToken(value) ? PDF_FAMILIES[value] : value;
}
