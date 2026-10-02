/**
 * Color allowlist for the canonical document schema.
 * Values mirror the palette defined in QuestionRichEditor.tsx.
 */

/** Text colors (from TEXT_COLORS in QuestionRichEditor.tsx). Reused by the
 * selection bubble's color swatches (plano §6.2) — keep in sync with the editor
 * palette via the drift guard in colors.test.ts. */
export const TEXT_COLORS = [
  "#1F2937",
  "#DC2626",
  "#2563EB",
  "#16A34A",
  "#9333EA",
  "#6B7280",
] as const;

export type TextColor = (typeof TEXT_COLORS)[number];

/**
 * Nome humano de cada cor de texto, em pt-BR.
 *
 * O swatch do SelectionBubble é um disco sem rótulo visível: o `aria-label` é a
 * única informação que o leitor de tela tem. Com o hex cru ali, ele soletrava
 * "Cor sustenido um F dois nove três sete" (caça 0211 — WCAG 2.2 SC 1.1.1 /
 * 4.1.2). O mapa mora ao lado da allowlist e é tipado sobre ela, então uma cor
 * nova sem nome quebra o teste em vez de vazar hex para a árvore de
 * acessibilidade.
 */
export const TEXT_COLOR_LABELS: Record<TextColor, string> = {
  "#1F2937": "preta",
  "#DC2626": "vermelha",
  "#2563EB": "azul",
  "#16A34A": "verde",
  "#9333EA": "roxa",
  "#6B7280": "cinza",
};

/** Highlight / background colors (from HIGHLIGHT_COLORS in QuestionRichEditor.tsx). */
const HIGHLIGHT_COLORS = [
  "#FEF08A",
  "#BBF7D0",
  "#BFDBFE",
  "#FBCFE8",
  "#FED7AA",
  "#DDD6FE",
] as const;

/** Combined palette — the only colors accepted in the document schema. */
export const ALLOWED_COLORS = [...TEXT_COLORS, ...HIGHLIGHT_COLORS] as const;

const _allowedSet = new Set(ALLOWED_COLORS.map((c) => c.toUpperCase()));

/**
 * Returns true only if `v` is a string present in the ALLOWED_COLORS palette
 * (case-insensitive). Rejects any value not in the list, including injection
 * attempts.
 */
export function isAllowedColor(v: unknown): boolean {
  return typeof v === "string" && _allowedSet.has(v.toUpperCase());
}

// ---------------------------------------------------------------------------
// Normalization (paste / DOM round-trip)
// ---------------------------------------------------------------------------

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_RE = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i;

/** Parse `#rgb`, `#rrggbb` or `rgb()/rgba()` into an uppercase `#RRGGBB`. */
function toHex6(raw: string): string | null {
  const value = raw.trim();

  const hex = HEX_RE.exec(value);
  if (hex !== null) {
    const digits = hex[1];
    const full =
      digits.length === 3
        ? digits
            .split("")
            .map((d) => d + d)
            .join("")
        : digits;
    return `#${full}`.toUpperCase();
  }

  const rgb = RGB_RE.exec(value);
  if (rgb === null) return null;
  const channels = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  if (channels.some((c) => c > 255)) return null;
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** Split an uppercase `#RRGGBB` into its three channels. */
function channelsOf(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** WCAG relative luminance of an uppercase `#RRGGBB`. */
function luminanceOf(hex: string): number {
  const [r, g, b] = channelsOf(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio of `hex` against the white sheet. */
function contrastOnWhite(hex: string): number {
  return 1.05 / (luminanceOf(hex) + 0.05);
}

/** Hue in degrees [0, 360) and chroma in [0, 1] of an uppercase `#RRGGBB`. */
function hueAndChroma(hex: string): { hue: number; chroma: number } {
  const [r, g, b] = channelsOf(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  if (chroma === 0) return { hue: 0, chroma };
  let hue: number;
  if (max === r) hue = ((g - b) / chroma) % 6;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;
  return { hue: (hue * 60 + 360) % 360, chroma };
}

/** Below this chroma a color reads as gray (the palette's ink and gray are ~0.09). */
const ACHROMATIC_CHROMA = 0.15;
/** Below this contrast on the white sheet, text is not reliably legible. */
const MIN_LEGIBLE_CONTRAST = 3;
/** Yellow/gold band: the palette has no text color of this hue. */
const YELLOW_BAND: [number, number] = [40, 75];

const INK = "#1F2937";
const GRAY = "#6B7280";
const CHROMATIC_TEXT_COLORS = TEXT_COLORS.filter(
  (c) => hueAndChroma(c).chroma >= ACHROMATIC_CHROMA,
).map((c) => ({ color: c as string, hue: hueAndChroma(c).hue }));

/**
 * Coerce an arbitrary CSS color into the canonical allowlist.
 *
 * Two paths feed colors that are NOT in the palette into the editor: a paste
 * from Word/Docs (any hex/rgb the source used) and — less obviously — our own
 * clipboard, because the DOM serializes `#DC2626` as `rgb(220, 38, 38)`. Both
 * used to reach the canonical model verbatim, where `Color` rejects them, so
 * the document stopped round-tripping on EVERY keystroke and the autosave
 * silently froze until the colored text was deleted.
 *
 * A foreign color maps ONLY to a TEXT_COLORS entry (the canonical model has no
 * highlight, so a pastel highlight tint as text color is near-invisible on the
 * sheet — caça 0610), choosing by HUE rather than plain RGB distance (which
 * favors luminance and sent Word purple/green to gray). Grays map to the ink or
 * the palette gray by darkness. Colors with no legible counterpart (white/light
 * gray, yellow/gold) return null: the text keeps the default ink. Identity
 * holds for colors already in the palette, so our own copy/paste round-trips
 * exactly. Unparseable values (`inherit`, `currentColor`, a gradient) also
 * return null — the caller then leaves the text unstyled.
 */
export function normalizeColor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const hex = toHex6(raw);
  if (hex === null) return null;
  if (isAllowedColor(hex)) return hex;

  const legible = contrastOnWhite(hex) >= MIN_LEGIBLE_CONTRAST;
  const { hue, chroma } = hueAndChroma(hex);

  if (chroma < ACHROMATIC_CHROMA) {
    if (!legible) return null;
    const lum = luminanceOf(hex);
    return Math.abs(lum - luminanceOf(INK)) <= Math.abs(lum - luminanceOf(GRAY)) ? INK : GRAY;
  }

  if (!legible && hue >= YELLOW_BAND[0] && hue < YELLOW_BAND[1]) return null;

  let nearest = CHROMATIC_TEXT_COLORS[0].color;
  let best = Infinity;
  for (const candidate of CHROMATIC_TEXT_COLORS) {
    const diff = Math.abs(hue - candidate.hue);
    const distance = Math.min(diff, 360 - diff);
    if (distance < best) {
      best = distance;
      nearest = candidate.color;
    }
  }
  return nearest;
}
