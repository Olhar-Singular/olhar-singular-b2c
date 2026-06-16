/**
 * Pure position math for the "+" block inserter (plano §6.4, Fase 5a).
 *
 * A "gap" is a boundary between two top-level blocks (or before the first /
 * after the last). Each gap carries the ProseMirror position where a new block
 * should be inserted and, when a block follows the gap, that block's id and
 * position — the latter is what the "Quebra de página" action targets (it sets
 * `style.pageBreakBefore` on the block AFTER the gap).
 *
 * Kept free of editor/view wiring so it is unit-testable at 100% against the
 * real ProseMirror schema (see topLevelGaps.test.ts). Conventions mirror
 * `blockMove.ts`: top-level blocks are direct children of `doc`; the position
 * right BEFORE the i-th child is the cumulative size of the children before it
 * (0 before the first), and the trailing gap sits at `doc.content.size`.
 */

import type { Node as PMNode } from "@tiptap/pm/model";

export interface BlockGap {
  /** Gap index: 0 = before the first block … N = after the last block. */
  index: number;
  /** Position where a new top-level block is inserted at this gap. */
  pos: number;
  /**
   * Position right before the block after this gap; null at the trailing gap.
   * "Quebra de página" targets this block; the menu hides it when it is null.
   */
  followingPos: number | null;
}

/** Compute every insertion gap between (and around) the doc's top-level blocks. */
export function topLevelGaps(doc: PMNode): BlockGap[] {
  const gaps: BlockGap[] = [];
  let pos = 0;
  for (let i = 0; i < doc.childCount; i++) {
    gaps.push({ index: i, pos, followingPos: pos });
    pos += doc.child(i).nodeSize;
  }
  // Trailing gap: after the last block, nothing follows.
  gaps.push({ index: doc.childCount, pos, followingPos: null });
  return gaps;
}
