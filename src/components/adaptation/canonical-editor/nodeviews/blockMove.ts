/**
 * Pure position math for moving a top-level QUESTION block up/down among other
 * question blocks, and for finding where to insert a new child at the end of a
 * question's stem.
 *
 * Kept free of React / NodeView wiring so the logic is unit-testable at 100%
 * against the real ProseMirror schema (see blockMove.test.ts). The NodeView only
 * builds a transaction from these results and dispatches it.
 *
 * Conventions:
 *  - `pos` is the position right BEFORE the node (the value `getPos()` yields).
 *  - top-level blocks are direct children of `doc`; their index is `index(0)`.
 *
 * Movement rules (question-only):
 *  - Questions can only swap positions with other questions; non-question blocks
 *    (headings, paragraphs, dividers…) are never displaced.
 *  - canMoveUp / canMoveDown return true only when an adjacent question exists in
 *    that direction, regardless of non-question blocks in between.
 */

import type { Node as PMNode } from "@tiptap/pm/model";

export type MoveDirection = "up" | "down";

/** A from/to slice to delete and an `insert` position to re-insert it at. */
export interface MoveTarget {
  from: number;
  to: number;
  insert: number;
}

/** The two nodes that will swap positions. */
export interface SwapTarget {
  /** Earlier-in-doc question (smaller position). */
  posFirst: number;
  nodeFirst: PMNode;
  /** Later-in-doc question (larger position). */
  posSecond: number;
  nodeSecond: PMNode;
}

/** Index of the top-level block at `pos` among `doc`'s direct children. */
export function topLevelIndex(doc: PMNode, pos: number): number {
  return doc.resolve(pos).index(0);
}

/** Position right before the `index`-th top-level child. */
function childPos(doc: PMNode, index: number): number {
  let p = 0;
  for (let i = 0; i < index; i++) p += doc.child(i).nodeSize;
  return p;
}

/** True when the node is a question block. */
function isQuestion(node: PMNode): boolean {
  return node.type.name === "question";
}

/**
 * Index of the nearest question block BEFORE `currentIndex`, or null.
 * Skips non-question blocks.
 */
function prevQuestionIndex(doc: PMNode, currentIndex: number): number | null {
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (isQuestion(doc.child(i))) return i;
  }
  return null;
}

/**
 * Index of the nearest question block AFTER `currentIndex`, or null.
 * Skips non-question blocks.
 */
function nextQuestionIndex(doc: PMNode, currentIndex: number): number | null {
  for (let i = currentIndex + 1; i < doc.childCount; i++) {
    if (isQuestion(doc.child(i))) return i;
  }
  return null;
}

/**
 * True when there is another question block before the question at `pos`.
 * Non-question blocks in between are skipped.
 */
export function canMoveUp(doc: PMNode, pos: number): boolean {
  return prevQuestionIndex(doc, topLevelIndex(doc, pos)) !== null;
}

/**
 * True when there is another question block after the question at `pos`.
 * Non-question blocks in between are skipped.
 */
export function canMoveDown(doc: PMNode, pos: number): boolean {
  return nextQuestionIndex(doc, topLevelIndex(doc, pos)) !== null;
}

/**
 * Returns the two nodes that should be swapped when moving the question at `pos`
 * in direction `dir` — the current question and the nearest question above/below.
 * Non-question blocks between them are ignored.
 *
 * `posFirst` / `nodeFirst` always refer to the earlier-in-doc node so the caller
 * can apply step 1 at the higher position first without invalidating posFirst.
 *
 * Returns null when no adjacent question exists in that direction.
 */
export function questionSwapTarget(
  doc: PMNode,
  pos: number,
  dir: MoveDirection,
): SwapTarget | null {
  const indexA = topLevelIndex(doc, pos);
  const indexB =
    dir === "up"
      ? prevQuestionIndex(doc, indexA)
      : nextQuestionIndex(doc, indexA);
  if (indexB === null) return null;

  const iFirst = Math.min(indexA, indexB);
  const iSecond = Math.max(indexA, indexB);
  return {
    posFirst: childPos(doc, iFirst),
    nodeFirst: doc.child(iFirst),
    posSecond: childPos(doc, iSecond),
    nodeSecond: doc.child(iSecond),
  };
}

/**
 * Compute the delete range and re-insert position to move the block at `pos`
 * one slot in `dir`. Returns null when the move is impossible (first up / last
 * down). Useful as a utility for general adjacent-block reordering; the question
 * NodeView uses `questionSwapTarget` instead.
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
