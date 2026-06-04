/**
 * Color allowlist for the canonical document schema.
 * Values mirror the palette defined in QuestionRichEditor.tsx.
 */

/** Text colors (from TEXT_COLORS in QuestionRichEditor.tsx). */
const TEXT_COLORS = [
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
