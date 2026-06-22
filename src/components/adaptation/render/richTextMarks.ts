/**
 * Pure mapping of canonical text-run marks/colors to Tailwind classes and
 * inline style. Kept separate from the component so the mapping is unit-tested.
 */

import type { CSSProperties } from "react";
import { isAllowedColor } from "@/lib/adaptation/canonical/colors";

type Mark = "bold" | "italic" | "underline" | "strike";

const MARK_CLASS: Record<Mark, string> = {
  bold: "font-bold",
  italic: "italic",
  underline: "underline",
  strike: "line-through",
};

/** Map an ordered mark list to a space-joined Tailwind className. */
export function marksToClassName(marks?: Mark[]): string {
  if (!marks || marks.length === 0) return "";
  return marks.map((m) => MARK_CLASS[m]).join(" ");
}

/** Map an optional (allowlisted) color and optional fontSize (pt) to an inline style object. */
export function textRunStyle(color?: string, fontSize?: number): CSSProperties {
  const style: CSSProperties = {};
  if (color !== undefined && isAllowedColor(color)) style.color = color;
  if (fontSize !== undefined && fontSize > 0) style.fontSize = `${fontSize}pt`;
  return style;
}
