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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ImageManagerModal from "@/components/editor/ImageManagerModal";
import type { ImageItem } from "@/components/editor/imageManagerUtils";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { newId } from "@/lib/adaptation/canonical/ids";
import { AnswerEditor } from "../answer-editors/AnswerEditor";
import { questionOrdinal } from "./nodeViewUtils";
import { canMoveUp, canMoveDown, type MoveDirection } from "./blockMove";
import { buildMoveTransaction, buildStemImageTransaction } from "./blockTransactions";

export function QuestionNodeView({ node, updateAttributes, editor, getPos, deleteNode }: NodeViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const answer = node.attrs.answer as QuestionAnswer;
  const disabled = !editor.isEditable;
  const pos = getPos();
  const ordinal = questionOrdinal(editor.state.doc, pos);
  const upDisabled = disabled || !canMoveUp(editor.state.doc, pos);
  const downDisabled = disabled || !canMoveDown(editor.state.doc, pos);

  const move = (dir: MoveDirection) => {
    const tr = buildMoveTransaction(editor.state, pos, dir);
    if (tr) editor.view.dispatch(tr);
  };

  const handlePick = (images: ImageItem[]) => {
    const first = images[0];
    if (!first) return;
    const tr = buildStemImageTransaction(editor.state, pos, {
      id: newId(),
      src: first.src,
      alt: "",
    });
    editor.view.dispatch(tr);
  };

  return (
    <NodeViewWrapper className="my-3 rounded-lg border border-border p-3" data-testid="question-node">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="secondary" data-testid="question-ordinal">
          Questão {ordinal}
        </Badge>
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
            disabled={disabled}
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
      </div>

      <div className="mb-2 rounded border border-dashed border-border p-2">
        <NodeViewContent />
      </div>

      <div className="mt-2" contentEditable={false}>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resposta</p>
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
