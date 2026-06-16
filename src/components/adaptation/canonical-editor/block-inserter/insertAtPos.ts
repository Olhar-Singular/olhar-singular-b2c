/**
 * Executes a "+" inserter action against the editor (plano §6.4, Fase 5a).
 *
 * Every mutation goes through an editor transaction (not `onChange` with a new
 * document): `useCanonicalEditor` seeds its content once and does NOT reconcile
 * external `value` changes, so transactions are the single mutation path — and
 * they keep undo working (§6.3) and the canonical round-trip intact (§9.3).
 *
 *  - `insert`: drops a schema-valid block node at the gap position. A new
 *    question additionally opens its expanded card (§6.4) via the per-editor
 *    card store, by the id the builder stamped on the node.
 *  - `pageBreak`: sets `style.pageBreakBefore` on the block AFTER the gap
 *    (the existing canonical field, §6.6 / §3). The visual marker on the sheet
 *    arrives in Fase 5b; the PDF already honours the field.
 */

import type { Editor } from "@tiptap/react";
import type { PMNode } from "@/lib/adaptation/tiptap/fromCanonical";
import type { NodeStyle } from "@/lib/adaptation/canonical/schema";
import { getQuestionCardStore } from "../nodeviews/questionCardState";
import type { BlockGap } from "./topLevelGaps";

export type InserterAction =
  | { type: "insert"; build: () => PMNode }
  | { type: "pageBreak" };

/** Run the chosen inserter action at the given gap. */
export function runInserterAction(editor: Editor, gap: BlockGap, action: InserterAction): void {
  if (action.type === "pageBreak") {
    applyPageBreakAt(editor, gap);
    return;
  }

  const node = action.build();
  editor.chain().focus().insertContentAt(gap.pos, node).run();

  if (node.type === "question") {
    const id = node.attrs?.id;
    if (typeof id === "string") getQuestionCardStore(editor).expand(id);
  }
}

/** Set `style.pageBreakBefore` on the block that follows the gap. */
function applyPageBreakAt(editor: Editor, gap: BlockGap): void {
  // The menu hides "Quebra de página" at the trailing gap; guard defensively.
  if (gap.followingPos == null) return;
  const followingPos = gap.followingPos;
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const node = state.doc.nodeAt(followingPos);
      if (!node) return false;
      const style: NodeStyle = { ...(node.attrs.style ?? {}), pageBreakBefore: true };
      tr.setNodeAttribute(followingPos, "style", style);
      return true;
    })
    .run();
}
