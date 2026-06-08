/**
 * Transaction builders that toggle an inline mark (or set a color) across ALL
 * text of one block — the "apply to whole block" quick toggles in the Estilo
 * popover. They mirror `blockTransactions.ts`: take an `EditorState`, return a
 * `Transaction` (or null), so the logic is unit-testable against the real
 * ProseMirror schema without a browser/view.
 *
 * The block is located by canonical `id` anywhere in the doc (top-level OR a
 * question-stem child). Its inline range is `[startOfContent, endOfContent]`.
 * Atoms / blocks without inline text (image, divider, blockMath, the question
 * wrapper itself) yield `null`.
 *
 * Toggle semantics for boolean marks: if EVERY text run in the range already
 * carries the mark, remove it; otherwise add it (matching ProseMirror's
 * `toggleMark` over a selection).
 */

import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";

/** The boolean inline marks the block-level quick toggles support. */
export type BlockToggleMark = "bold" | "italic";

interface BlockRange {
  /** Position just after the block's open token (start of its inline content). */
  from: number;
  /** Position just before the block's close token (end of its inline content). */
  to: number;
  node: PMNode;
}

/**
 * Find the block with `id` anywhere in the doc and return the position range of
 * its inline content. Returns null when no block matches or the block holds no
 * inline text (atom / no text children).
 */
function findBlockRange(doc: PMNode, id: string): BlockRange | null {
  let found: BlockRange | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.attrs?.id !== id) return undefined;
    // Inline content lives between the node's open and close tokens.
    const from = pos + 1;
    const to = pos + node.nodeSize - 1;
    // No inline text to mark (atom, or a wrapper whose direct content is blocks).
    if (to <= from || !node.inlineContent) return false;
    found = { from, to, node };
    return false;
  });
  return found;
}

/** True when every text node in `[from, to)` already carries `markName`. */
function rangeFullyMarked(doc: PMNode, from: number, to: number, markName: string): boolean {
  let sawText = false;
  let allMarked = true;
  doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return undefined;
    sawText = true;
    if (!node.marks.some((m) => m.type.name === markName)) allMarked = false;
    return false;
  });
  return sawText && allMarked;
}

/**
 * Build a transaction toggling `mark` across all text of the block `blockId`.
 * Returns null when the block is absent or has no inline text.
 */
export function applyMarkToBlock(
  state: EditorState,
  blockId: string,
  mark: BlockToggleMark,
): Transaction | null {
  const range = findBlockRange(state.doc, blockId);
  if (!range) return null;

  const markType = state.schema.marks[mark];
  const { from, to } = range;
  const tr = state.tr;
  if (rangeFullyMarked(state.doc, from, to, mark)) {
    tr.removeMark(from, to, markType);
  } else {
    tr.addMark(from, to, markType.create());
  }
  return tr;
}

/**
 * Build a transaction setting the text `color` across all text of the block
 * `blockId`, or clearing it when `color` is null. Color is carried by the
 * `textStyle` mark (the Color extension). Returns null when the block is absent
 * or has no inline text.
 */
export function applyColorToBlock(
  state: EditorState,
  blockId: string,
  color: string | null,
): Transaction | null {
  const range = findBlockRange(state.doc, blockId);
  if (!range) return null;

  const textStyle = state.schema.marks.textStyle;
  const { from, to } = range;
  const tr = state.tr.removeMark(from, to, textStyle);
  if (color !== null) tr.addMark(from, to, textStyle.create({ color }));
  return tr;
}
