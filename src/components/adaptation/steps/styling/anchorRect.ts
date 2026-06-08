/**
 * Pure-ish geometry helper: the bounding rect of a top-level block's DOM node,
 * expressed relative to a container element, for anchoring the Estilo popover
 * next to the current block.
 *
 * All reads are DEFENSIVE — the project has hit `getPos`/position crashes before.
 * A null/undefined editor, an out-of-range position, or a missing DOM node all
 * yield `null` (popover then falls back to a neutral anchor) instead of throwing.
 */

import type { Editor } from "@tiptap/react";

export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Compute the current block's rect relative to `container`. Returns null when
 * anything needed is missing/invalid.
 */
export function blockAnchorRect(
  editor: Editor | null,
  pos: number | null | undefined,
  container: HTMLElement | null,
): AnchorRect | null {
  if (!editor || typeof pos !== "number" || !container) return null;

  // Defensive: an editor may be mid-mount without a resolved state/view.
  const docSize = editor.state?.doc?.content?.size;
  if (typeof docSize !== "number") return null;
  // Guard out-of-range positions before touching the view.
  if (pos < 0 || pos >= docSize) return null;

  let dom: ReturnType<Editor["view"]["nodeDOM"]>;
  try {
    dom = editor.view.nodeDOM(pos);
  } catch {
    return null;
  }
  if (!(dom instanceof HTMLElement)) return null;

  const nodeRect = dom.getBoundingClientRect();
  const baseRect = container.getBoundingClientRect();
  return {
    top: nodeRect.top - baseRect.top,
    left: nodeRect.left - baseRect.left,
    width: nodeRect.width,
    height: nodeRect.height,
  };
}
