/**
 * QuestionNodeView — orchestrates a question block's two states (plano §6.3):
 *
 * - PREVIEW (at rest): the folha as printed — positional ordinal, editable stem
 *   (NodeViewContent), light inline instruction, and the print-faithful answer
 *   with NO gabarito. A hover rail offers ✎ editar + move / image / delete.
 * - CARD (expanded): the structural editor — stem, named instruction field, the
 *   full AnswerEditor (answer key visible), Concluir.
 *
 * Expansion is coordinated outside the canonical document (round-trip stays
 * intact, §9.3): a per-editor store keeps a single card open; Esc/Concluir close.
 * There is no editor mode — structure always lives in the expanded card.
 */

import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, ImagePlus, Pencil, Trash2 } from "lucide-react";
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import ImageManagerModal from "@/components/editor/ImageManagerModal";
import type { ImageItem } from "@/components/editor/imageManagerUtils";
import type { QuestionAnswer, RichText } from "@/lib/adaptation/canonical/schema";
import { newId } from "@/lib/adaptation/canonical/ids";
import { questionOrdinal } from "./nodeViewUtils";
import { canMoveUp, canMoveDown, type MoveDirection } from "./blockMove";
import { buildMoveTransaction, buildStemImageTransaction } from "./blockTransactions";
import { useQuestionCard } from "./questionCardState";
import { QuestionPreview } from "./QuestionPreview";
import { QuestionCard } from "./QuestionCard";

export function QuestionNodeView({ node, updateAttributes, editor, getPos, deleteNode }: NodeViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const answer = node.attrs.answer as QuestionAnswer;
  const instruction = node.attrs.instruction as RichText | null;
  const id = node.attrs.id as string;
  const disabled = !editor.isEditable;

  const { expanded, expand, collapse } = useQuestionCard(editor, id);

  // Esc closes the open card (coordination is React/editor state, not the doc).
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") collapse();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded, collapse]);

  // Tiptap's `getPos()` can return `undefined` transiently (initial mount /
  // edit-mode rehydration). Guard it: a non-number position must never reach
  // questionOrdinal/canMove*/the transactions, which would throw out of range.
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
    const tr = buildStemImageTransaction(editor.state, pos, { id: newId(), src: first.src, alt: "" });
    editor.view.dispatch(tr);
  };

  const onAnswerChange = (next: QuestionAnswer) => updateAttributes({ answer: next });
  const onInstructionChange = (next: RichText | null) => updateAttributes({ instruction: next });

  const rail = (
    <div
      className="absolute right-0 top-0 z-10 hidden items-center gap-1 rounded-md border border-surface-line-2 bg-surface-paper p-0.5 shadow-sm group-hover:flex group-focus-within:flex"
      contentEditable={false}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-surface-accent"
        disabled={disabled}
        onClick={expand}
        title="Editar questão"
        aria-label="Editar questão"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={upDisabled} onClick={() => move("up")} title="Mover questão para cima" aria-label="Mover questão para cima">
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={downDisabled} onClick={() => move("down")} title="Mover questão para baixo" aria-label="Mover questão para baixo">
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled || pos === null} onClick={() => setModalOpen(true)} title="Adicionar imagem à questão" aria-label="Adicionar imagem à questão">
        <ImagePlus className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={disabled} onClick={() => deleteNode()} title="Excluir questão" aria-label="Excluir questão">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return (
    <NodeViewWrapper className="group relative my-3" data-testid="question-node">
      {expanded ? (
        <QuestionCard
          num={ordinal}
          answer={answer}
          instruction={instruction}
          disabled={disabled}
          onAnswerChange={onAnswerChange}
          onInstructionChange={onInstructionChange}
          onDone={collapse}
          stem={<NodeViewContent />}
        />
      ) : (
        <QuestionPreview
          num={ordinal}
          answer={answer}
          instruction={instruction}
          disabled={disabled}
          onAnswerChange={onAnswerChange}
          onInstructionChange={onInstructionChange}
          stem={<NodeViewContent />}
          rail={rail}
        />
      )}

      <ImageManagerModal open={modalOpen} onClose={() => setModalOpen(false)} onConfirm={handlePick} />
    </NodeViewWrapper>
  );
}
