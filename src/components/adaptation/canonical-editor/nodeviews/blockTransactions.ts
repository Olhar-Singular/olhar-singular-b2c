/**
 * Transaction builders for the question-card actions that mutate the document
 * structure: moving a top-level block up/down and inserting images (into a
 * question's stem, or as siblings of an image block).
 *
 * These take an `EditorState` and return a `Transaction` (or null) so they can
 * be unit-tested against the real ProseMirror schema without a browser/view —
 * the NodeView just dispatches the result. The position math lives in the pure
 * `blockMove` module.
 */

import type { EditorState, Transaction } from "@tiptap/pm/state";
import { questionSwapTarget, stemInsertPos, type MoveDirection } from "./blockMove";

/**
 * Build a transaction that swaps the question at `pos` with the nearest question
 * in direction `dir`, skipping any non-question blocks between them. Returns null
 * when no adjacent question exists in that direction.
 *
 * The swap is done in two steps applied to the same transaction:
 *  1. Replace the LATER node with the EARLIER node (high position first, so the
 *     lower position stays valid for step 2).
 *  2. Replace the EARLIER node with the LATER node.
 * Non-question blocks that lie between the two questions remain in place.
 */
export function buildMoveTransaction(
  state: EditorState,
  pos: number,
  dir: MoveDirection,
): Transaction | null {
  const target = questionSwapTarget(state.doc, pos, dir);
  if (!target) return null;

  const { posFirst, nodeFirst, posSecond, nodeSecond } = target;
  const tr = state.tr;
  // Step 1: replace the later node with the earlier node (posSecond > posFirst,
  // so this doesn't shift posFirst).
  tr.replaceWith(posSecond, posSecond + nodeSecond.nodeSize, nodeFirst);
  // Step 2: replace the earlier node with the later node.
  tr.replaceWith(posFirst, posFirst + nodeFirst.nodeSize, nodeSecond);
  return tr;
}

/** Minimal canonical image shape needed to build the PM image node. */
export interface StemImage {
  id: string;
  src: string;
  alt: string;
  alignment: string | null;
}

/** Materialize a batch of canonical images as PM `image` nodes, in order. */
function imageNodes(state: EditorState, images: StemImage[]) {
  return images.map((image) =>
    state.schema.nodes.image.create({
      id: image.id,
      src: image.src,
      alt: image.alt,
      alignment: image.alignment,
    }),
  );
}

/**
 * Build a transaction that appends `images` as the last stem children of the
 * question block at `pos`.
 *
 * Takes the WHOLE batch (achado 0318): the image modal is multi-select from end
 * to end ("Inserir (3)"), so dropping everything past the first silently threw
 * away the user's input.
 */
export function buildStemImagesTransaction(
  state: EditorState,
  pos: number,
  images: StemImage[],
): Transaction {
  return state.tr.insert(stemInsertPos(state.doc, pos), imageNodes(state, images));
}

/**
 * Build a transaction that inserts `images` right after the block at `pos`, as
 * siblings. Used by the image block when the modal returns a batch: the first
 * image replaces the block itself and the remainder lands just below it
 * (achado 0318). Returns null when there is no node at `pos`.
 */
export function buildSiblingImagesTransaction(
  state: EditorState,
  pos: number,
  images: StemImage[],
): Transaction | null {
  const node = state.doc.resolve(pos).nodeAfter;
  if (!node) return null;
  return state.tr.insert(pos + node.nodeSize, imageNodes(state, images));
}
