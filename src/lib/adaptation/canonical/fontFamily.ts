/**
 * Logical font-family tokens for the canonical document schema and the
 * document-level "Aparência" style (`pageStyle.fontFamily`).
 *
 * Each logical token is mapped through this single source of truth so the screen
 * (CSS) and the PDF (@react-pdf) can never silently diverge:
 *
 *   - `fontFamilyToCss` → a CSS font stack
 *   - `fontFamilyToPdf` → a @react-pdf family name
 *
 * The classic tokens `sans/serif/mono` map to @react-pdf built-ins (no
 * registration). The accessibility tokens (`atkinson/lexend/opendyslexic`) map
 * to families that MUST be registered with `Font.register` in `render/pdf/`
 * (see `registerFonts.ts`) and self-hosted via `@font-face` for the screen —
 * otherwise the PDF silently falls back to a built-in. `georgia/arial` are
 * system fonts on screen and map to the closest built-in in the PDF.
 */

/** The logical font tokens stored in `NodeStyle.fontFamily` / `pageStyle.fontFamily`. */
export const FONT_FAMILY_TOKENS = [
  "sans",
  "serif",
  "mono",
  "atkinson",
  "lexend",
  "opendyslexic",
  "georgia",
  "arial",
] as const;

export type FontFamilyToken = (typeof FONT_FAMILY_TOKENS)[number];

/** Human-readable labels (pt-BR) for the legacy styling picker. */
export const FONT_FAMILY_OPTIONS: { value: FontFamilyToken; label: string }[] = [
  { value: "sans", label: "Padrão" },
  { value: "serif", label: "Serifada" },
  { value: "mono", label: "Monoespaçada" },
  { value: "atkinson", label: "Atkinson Hyperlegible" },
  { value: "lexend", label: "Lexend" },
  { value: "opendyslexic", label: "OpenDyslexic" },
  { value: "georgia", label: "Georgia" },
  { value: "arial", label: "Arial" },
];

export type FontFamilyGroup = "acessibilidade" | "classicas";

/**
 * Grouped font options for the "Aparência" popover (plano D12). Accessibility
 * fonts first (the signature pedagogical tool), then the classic serif/sans.
 */
export const APPEARANCE_FONT_GROUPS: {
  group: FontFamilyGroup;
  label: string;
  options: { value: FontFamilyToken; label: string }[];
}[] = [
  {
    group: "acessibilidade",
    label: "Acessibilidade",
    options: [
      { value: "atkinson", label: "Atkinson Hyperlegible" },
      { value: "lexend", label: "Lexend" },
      { value: "opendyslexic", label: "OpenDyslexic" },
    ],
  },
  {
    group: "classicas",
    label: "Clássicas",
    options: [
      { value: "georgia", label: "Georgia" },
      { value: "arial", label: "Arial" },
    ],
  },
];

const CSS_STACKS: Record<FontFamilyToken, string> = {
  sans: "Helvetica, Arial, sans-serif",
  serif: "Times New Roman, Times, serif",
  mono: "Courier New, Courier, monospace",
  atkinson: "'Atkinson Hyperlegible', sans-serif",
  lexend: "'Lexend', sans-serif",
  opendyslexic: "'OpenDyslexic', sans-serif",
  georgia: "Georgia, serif",
  arial: "Arial, Helvetica, sans-serif",
};

/**
 * The matching @react-pdf family for each token. Accessibility families are the
 * names registered in `registerFonts.ts`; `georgia/arial` approximate to the
 * closest built-in (no font file shipped for them).
 */
const PDF_FAMILIES: Record<FontFamilyToken, string> = {
  sans: "Helvetica",
  serif: "Times-Roman",
  mono: "Courier",
  atkinson: "Atkinson Hyperlegible",
  lexend: "Lexend",
  opendyslexic: "OpenDyslexic",
  georgia: "Times-Roman",
  arial: "Helvetica",
};

/** True when `v` is one of the logical font tokens. */
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
 * Map a logical token to a @react-pdf family. Unknown values are passed through
 * unchanged (matching `fontFamilyToCss`).
 */
export function fontFamilyToPdf(value: string): string {
  return isFontFamilyToken(value) ? PDF_FAMILIES[value] : value;
}
