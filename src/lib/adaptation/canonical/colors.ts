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
 * We map to the NEAREST allowed color (plain RGB distance) rather than dropping
 * it: a teacher who pastes a red word means the emphasis, and the palette has a
 * red. Identity holds for colors already in the palette, so our own copy/paste
 * round-trips exactly. Unparseable values (`inherit`, `currentColor`, a
 * gradient) return null — the caller then leaves the text unstyled.
 */
export function normalizeColor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const hex = toHex6(raw);
  if (hex === null) return null;
  if (isAllowedColor(hex)) return hex;

  const [r, g, b] = channelsOf(hex);
  let nearest = ALLOWED_COLORS[0] as string;
  let best = Infinity;
  for (const candidate of ALLOWED_COLORS) {
    const [cr, cg, cb] = channelsOf(candidate.toUpperCase());
    const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (distance < best) {
      best = distance;
      nearest = candidate;
    }
  }
  return nearest.toUpperCase();
}
