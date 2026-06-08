/**
 * QuestionNodeView — renders a question block in the editor.
 *
 * - The header shows a READ-ONLY "Questão N" label, where N is the question's
 *   automatic ordinal (its 1-based position among all question nodes in the
 *   document). Questions have no editable number/points/difficulty.
 * - Header actions (right side): move up/down among top-level blocks, add an
 *   image to the stem, and delete the question.
 * - the stem is editable rich content via `NodeViewContent`.
 * - the discriminated `answer` is edited through `AnswerEditor`, whose changes
 *   are written back via `updateAttributes({ answer })`.
 */

import { useState } from "react";
import { ArrowUp, ArrowDown, ImagePlus, Trash2 } from "lucide-react";
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import ImageManagerModal from "@/components/editor/ImageManagerModal";
import type { ImageItem } from "@/components/editor/imageManagerUtils";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { newId } from "@/lib/adaptation/canonical/ids";
import { AnswerEditor } from "../answer-editors/AnswerEditor";
import { useEditorMode } from "../EditorMode";
import { questionOrdinal } from "./nodeViewUtils";
import { canMoveUp, canMoveDown, type MoveDirection } from "./blockMove";
import { buildMoveTransaction, buildStemImageTransaction } from "./blockTransactions";

export function QuestionNodeView({ node, updateAttributes, editor, getPos, deleteNode }: NodeViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  // Structure actions (move / add-image / delete) belong to the CONTENT step.
  // In the Estilo step you're formatting, not restructuring — hide them.
  const showStructureActions = useEditorMode() === "content";
  const answer = node.attrs.answer as QuestionAnswer;
  const disabled = !editor.isEditable;
  // Tiptap's `getPos()` can return `undefined` transiently (e.g. during the
  // initial mount / edit-mode rehydration). Guard it: a non-number position
  // must never reach `questionOrdinal`/`canMove*`/the transactions, which
  // resolve it against the doc and would throw "Position undefined out of range".
  const rawPos = getPos();
  const pos = typeof rawPos === "number" ? rawPos : null;
  const ordinal = pos === null ? undefined : questionOrdinal(editor.state.doc, pos);
  const upDisabled = disabled || pos === null || !canMoveUp(editor.state.doc, pos);
  const downDisabled = disabled || pos === null || !canMoveDown(editor.state.doc, pos);

  const move = (dir: MoveDirection) => {
    /* v8 ignore next -- defensive type-narrow; the move buttons are disabled when pos is null */
    if (pos === null) return;
    const tr = buildMoveTransaction(editor.state, pos, dir);
    if (tr) editor.view.dispatch(tr);
  };

  const handlePick = (images: ImageItem[]) => {
    const first = images[0];
    if (!first) return;
    /* v8 ignore next -- defensive type-narrow; the add-image button is disabled when pos is null */
    if (pos === null) return;
    const tr = buildStemImageTransaction(editor.state, pos, {
      id: newId(),
      src: first.src,
      alt: "",
    });
    editor.view.dispatch(tr);
  };

  return (
    <NodeViewWrapper className="my-4 space-y-3 rounded-xl border border-border/60 p-4" data-testid="question-node">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          data-testid="question-ordinal"
        >
          Questão {ordinal}
        </span>
        {showStructureActions && (
          <div className="ml-auto flex items-center gap-1" contentEditable={false}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={upDisabled}
              onClick={() => move("up")}
              title="Mover questão para cima"
              aria-label="Mover questão para cima"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={downDisabled}
              onClick={() => move("down")}
              title="Mover questão para baixo"
              aria-label="Mover questão para baixo"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={disabled || pos === null}
              onClick={() => setModalOpen(true)}
              title="Adicionar imagem à questão"
              aria-label="Adicionar imagem à questão"
            >
              <ImagePlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              disabled={disabled}
              onClick={() => deleteNode()}
              title="Excluir questão"
              aria-label="Excluir questão"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="px-0.5">
        <NodeViewContent />
      </div>

      <div className="space-y-2 border-t border-border/60 pt-3" contentEditable={false}>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resposta</p>
        <AnswerEditor
          answer={answer}
          disabled={disabled}
          onChange={(next) => updateAttributes({ answer: next })}
        />
      </div>

      <ImageManagerModal open={modalOpen} onClose={() => setModalOpen(false)} onConfirm={handlePick} />
    </NodeViewWrapper>
  );
}
