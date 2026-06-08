/**
 * Pure helper for the Estilo step: which top-level block the editor selection
 * currently sits in.
 *
 * A "current block" is the depth-1 ancestor of `state.selection.$from` (depth 0
 * is the doc). Questions are top-level even when the cursor is inside their stem
 * — the cursor resolves through the stem paragraph up to the question node, and
 * we read the QUESTION's id, so styling a stem cursor targets the question card.
 *
 * Kept free of React / view wiring so it can be unit-tested against the real
 * ProseMirror schema. All position reads are defensive: a selection whose
 * resolved depth is 0, or whose top-level node carries no `id`, yields `null`
 * rather than throwing.
 */

import type { EditorState } from "@tiptap/pm/state";

export interface CurrentBlock {
  /** The canonical block id (the `id` attr of the top-level PM node). */
  id: string;
  /** The position just BEFORE that top-level node (what `getPos()` yields). */
  pos: number;
}

/**
 * Return the top-level block at the editor selection, or `null` when there is
 * no styleable top-level block (no depth, or the node has no id).
 */
export function currentTopLevelBlock(state: EditorState): CurrentBlock | null {
  const $from = state.selection.$from;
  if ($from.depth < 1) return null;

  const node = $from.node(1);
  const id = node.attrs?.id;
  if (typeof id !== "string" || id.length === 0) return null;

  // `before(1)` is the position immediately before the depth-1 node.
  return { id, pos: $from.before(1) };
}
