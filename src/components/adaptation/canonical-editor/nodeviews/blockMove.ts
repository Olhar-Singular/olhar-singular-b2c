/**
 * Pure position math for moving a top-level block up/down and for finding where
 * to insert a new child at the end of a question's stem.
 *
 * Kept free of React / NodeView wiring so the logic is unit-testable at 100%
 * against the real ProseMirror schema (see blockMove.test.ts). The NodeView only
 * builds a transaction from these results and dispatches it.
 *
 * Conventions:
 *  - `pos` is the position right BEFORE the node (the value `getPos()` yields).
 *  - top-level blocks are direct children of `doc`; their index is `index(0)`.
 */

import type { Node as PMNode } from "@tiptap/pm/model";

export type MoveDirection = "up" | "down";

/** A from/to slice to delete and an `insert` position to re-insert it at. */
export interface MoveTarget {
  from: number;
  to: number;
  insert: number;
}

/** Index of the top-level block at `pos` among `doc`'s direct children. */
export function topLevelIndex(doc: PMNode, pos: number): number {
  return doc.resolve(pos).index(0);
}

/** True when the block at `pos` is not the first top-level block. */
export function canMoveUp(doc: PMNode, pos: number): boolean {
  return topLevelIndex(doc, pos) > 0;
}

/** True when the block at `pos` is not the last top-level block. */
export function canMoveDown(doc: PMNode, pos: number): boolean {
  return topLevelIndex(doc, pos) < doc.childCount - 1;
}

/**
 * Compute the delete range and re-insert position to move the block at `pos`
 * one slot in `dir`. Returns null when the move is impossible (first up / last
 * down). The `insert` position is expressed in the ORIGINAL document — because
 * the deleted slice sits entirely after the previous sibling (up) and the node
 * being moved is removed before the next sibling is reached (down), these
 * positions stay valid after the delete when applied as a single transaction
 * via ProseMirror's mapping.
 */
export function moveTarget(doc: PMNode, pos: number, dir: MoveDirection): MoveTarget | null {
  const index = topLevelIndex(doc, pos);
  const node = doc.child(index);
  const from = pos;
  const to = pos + node.nodeSize;

  if (dir === "up") {
    if (index === 0) return null;
    const prev = doc.child(index - 1);
    return { from, to, insert: pos - prev.nodeSize };
  }
  if (index === doc.childCount - 1) return null;
  const next = doc.child(index + 1);
  return { from, to, insert: to + next.nodeSize };
}

/**
 * Position just inside the END of the question block at `pos` — i.e. after its
 * last stem child. A new block inserted here becomes the question's last stem
 * child. `nodeSize - 1` strips the node's closing token, landing inside it.
 */
export function stemInsertPos(doc: PMNode, pos: number): number {
  const node = doc.child(topLevelIndex(doc, pos));
  return pos + node.nodeSize - 1;
}
