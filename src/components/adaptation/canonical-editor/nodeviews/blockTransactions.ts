/**
 * Transaction builders for the question-card actions that mutate the document
 * structure: moving a top-level block up/down and appending an image to a
 * question's stem.
 *
 * These take an `EditorState` and return a `Transaction` (or null) so they can
 * be unit-tested against the real ProseMirror schema without a browser/view —
 * the NodeView just dispatches the result. The position math lives in the pure
 * `blockMove` module.
 */

import type { EditorState, Transaction } from "@tiptap/pm/state";
import { moveTarget, stemInsertPos, type MoveDirection } from "./blockMove";

/**
 * Build a transaction that moves the top-level block at `pos` one slot in `dir`.
 * Returns null when the move is impossible (first up / last down).
 *
 * It deletes the node's slice, then re-inserts the SAME node at the target.
 * Deleting first and mapping the insert position keeps both ends valid in one
 * transaction: for "up" the target sits before the cut (unchanged); for "down"
 * it sits after the cut and the mapping shifts it to land after the next sibling.
 */
export function buildMoveTransaction(
  state: EditorState,
  pos: number,
  dir: MoveDirection,
): Transaction | null {
  const target = moveTarget(state.doc, pos, dir);
  if (!target) return null;

  const node = state.doc.child(state.doc.resolve(pos).index(0));
  const tr = state.tr.delete(target.from, target.to);
  tr.insert(tr.mapping.map(target.insert), node);
  return tr;
}

/** Minimal canonical image shape needed to build the PM image node. */
export interface StemImage {
  id: string;
  src: string;
  alt: string;
}

/**
 * Build a transaction that appends `image` as the last stem child of the
 * question block at `pos`.
 */
export function buildStemImageTransaction(
  state: EditorState,
  pos: number,
  image: StemImage,
): Transaction {
  const node = state.schema.nodes.image.create({
    id: image.id,
    src: image.src,
    alt: image.alt,
  });
  return state.tr.insert(stemInsertPos(state.doc, pos), node);
}
