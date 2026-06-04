/**
 * Pure mapping of canonical text-run marks/colors to react-pdf text styles.
 * Kept separate from PdfRichText (mirroring the screen renderer's
 * richTextMarks.ts) so the mapping stays unit-tested and the component file
 * exports only components.
 */

import type { Style } from "@react-pdf/types";
import { isAllowedColor } from "@/lib/adaptation/canonical/colors";

type Mark = "bold" | "italic" | "underline" | "strike";

/** Map an ordered mark list + optional color to a react-pdf text Style. */
export function marksToPdfStyle(marks?: Mark[], color?: string): Style {
  const style: Style = {};
  if (marks?.includes("bold")) style.fontWeight = "bold";
  if (marks?.includes("italic")) style.fontStyle = "italic";
  const decorations: string[] = [];
  if (marks?.includes("underline")) decorations.push("underline");
  if (marks?.includes("strike")) decorations.push("line-through");
  if (decorations.length > 0) style.textDecoration = decorations.join(" ") as Style["textDecoration"];
  if (color !== undefined && isAllowedColor(color)) style.color = color;
  return style;
}
