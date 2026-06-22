/**
 * QuestionNodeView — orchestrates a question block's two states (plano §6.3):
 *
 * - PREVIEW (at rest): the folha as printed — positional ordinal, editable stem
 *   (NodeViewContent), light inline instruction, and the print-faithful answer
 *   with NO gabarito. A hover rail offers ✎ editar + move / image / delete /
 *   restore-original.
 * - CARD (expanded): the structural editor — stem, buffered instruction + answer
 *   (written to doc only on Concluir), Cancelar (restores stem + discards buffered
 *   changes), Concluir.
 *
 * Expansion is coordinated outside the canonical document (round-trip stays
 * intact, §9.3): a per-editor store keeps a single card open; Esc/Concluir close.
 *
 * Cancel strategy: answer/instruction are buffered inside QuestionCard local state
 * and never written to the document unless Concluir is clicked. The stem IS always
 * live (NodeViewContent) so Cancel restores it via schema.nodeFromJSON + replaceWith.
 *
 * Reset strategy: OriginalDocExtension saves each question's JSON at editor-mount
 * time. Reset replaces the whole node with that snapshot.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, ImagePlus, Pencil, RotateCcw, Trash2 } from "lucide-react";
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
import type { QuestionNodeJSON } from "../originalDocExtension";

/**
 * Scan the doc's direct children for the node with the given id, returning its
 * offset. Falls back to null when the node isn't found (e.g. mid-deletion).
 * Using doc.forEach() instead of getPos() avoids stale positions that can linger
 * in the React render cycle right after a move transaction dispatches.
 */
function findTopLevelPosById(
  doc: { forEach: (fn: (node: { attrs: Record<string, unknown> }, offset: number) => void) => void },
  id: string,
): number | null {
  let found: number | null = null;
  doc.forEach((node, offset) => {
    if (node.attrs.id === id) found = offset;
  });
  return found;
}

export function QuestionNodeView({ node, updateAttributes, editor, getPos, deleteNode }: NodeViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const answer = node.attrs.answer as QuestionAnswer;
  const instruction = node.attrs.instruction as RichText | null;
  const enunciado = node.attrs.enunciado as RichText | null;
  const enunciadoPosition = (node.attrs.enunciadoPosition ?? "below") as "above" | "below";
  const id = node.attrs.id as string;
  const disabled = !editor.isEditable;

  const { expanded, expand, collapse } = useQuestionCard(editor, id);

  // Snapshot of the full question node JSON captured when the card is opened —
  // used by Cancel to restore the live stem content (attrs are buffered in
  // QuestionCard local state and don't need restoration on Cancel).
  const snapshotRef = useRef<QuestionNodeJSON | null>(null);

  // Esc closes the open card (coordination is React/editor state, not the doc).
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // Tiptap's `getPos()` can return `undefined` transiently (initial mount /
  // edit-mode rehydration) and may be stale right after a move transaction
  // dispatches. Derive the live position from the current doc state instead;
  // fall back to getPos() only when the node isn't found (e.g. mid-deletion).
  const rawPos = getPos();
  const rawPosNum = typeof rawPos === "number" ? rawPos : null;
  const pos = findTopLevelPosById(editor.state.doc, id) ?? rawPosNum;
  const ordinal = pos === null ? undefined : questionOrdinal(editor.state.doc, pos);
  const upDisabled = disabled || pos === null || !canMoveUp(editor.state.doc, pos);
  const downDisabled = disabled || pos === null || !canMoveDown(editor.state.doc, pos);

  const move = (dir: MoveDirection) => {
    // Call getPos() at click time — the render-time `pos` can be stale after
    // a previous move dispatched a transaction and Tiptap hasn't re-rendered yet.
    const currentPos = getPos();
    /* v8 ignore next -- defensive type-narrow; the move buttons are disabled when pos is null */
    if (typeof currentPos !== "number") return;
    const tr = buildMoveTransaction(editor.state, currentPos, dir);
    if (tr) editor.view.dispatch(tr);
  };

  const handlePick = (images: ImageItem[]) => {
    const first = images[0];
    if (!first) return;
    const currentPos = getPos();
    /* v8 ignore next -- defensive type-narrow; the add-image button is disabled when pos is null */
    if (typeof currentPos !== "number") return;
    const tr = buildStemImageTransaction(editor.state, currentPos, { id: newId(), src: first.src, alt: "" });
    editor.view.dispatch(tr);
  };

  const handleExpand = () => {
    // Save the WHOLE node as JSON so Cancel can restore the stem content
    // (attrs don't need saving — QuestionCard buffers them locally).
    snapshotRef.current = node.toJSON() as QuestionNodeJSON;
    expand();
  };

  /** Concluir: write buffered answer + instruction + enunciado to the Tiptap document. */
  const handleCommit = (
    committedAnswer: QuestionAnswer,
    committedInstruction: RichText | null,
    committedEnunciado: RichText | null,
    committedEnunciadoPosition: "above" | "below",
  ) => {
    updateAttributes({
      answer: committedAnswer,
      instruction: committedInstruction,
      enunciado: committedEnunciado,
      enunciadoPosition: committedEnunciadoPosition,
    });
    collapse();
  };

  /** Cancelar: restore the live stem content from the snapshot, discard buffered attrs. */
  const handleCancel = () => {
    const snap = snapshotRef.current;
    /* v8 ignore next -- defensive guard; snap is always set before expand() is called */
    if (snap) {
      const currentPos = getPos();
      if (typeof currentPos === "number") {
        const restoredNode = editor.state.schema.nodeFromJSON(snap);
        const tr = editor.state.tr.replaceWith(currentPos, currentPos + node.nodeSize, restoredNode);
        editor.view.dispatch(tr);
      }
    }
    collapse();
  };

  /** Restaurar original: replace the entire node with the session-start snapshot. */
  const handleReset = () => {
    const originalSnap = (editor.storage.originalDoc?.snapshots as Map<string, QuestionNodeJSON> | undefined)?.get(id);
    /* v8 ignore next -- no-op if the extension isn't mounted (e.g. outside Revisar) */
    if (!originalSnap) return;
    collapse(); // clear expanded state BEFORE replacing the node
    const currentPos = getPos();
    /* v8 ignore next -- defensive type-narrow; Restaurar button is disabled when pos is null */
    if (typeof currentPos === "number") {
      const restoredNode = editor.state.schema.nodeFromJSON(originalSnap);
      const tr = editor.state.tr.replaceWith(currentPos, currentPos + node.nodeSize, restoredNode);
      editor.view.dispatch(tr);
    }
  };

  const onAnswerChange = (next: QuestionAnswer) => updateAttributes({ answer: next });
  const onInstructionChange = (next: RichText | null) => updateAttributes({ instruction: next });

  const rail = (
    <div
      data-role="question-rail"
      className="absolute right-0 top-0 z-10 hidden items-center gap-1 rounded-md border border-surface-line-2 bg-surface-paper p-0.5 shadow-sm group-hover:flex group-focus-within:flex"
      contentEditable={false}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-surface-accent"
        disabled={disabled}
        onClick={handleExpand}
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
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled} onClick={handleReset} title="Restaurar questão ao original" aria-label="Restaurar questão ao original">
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={disabled} onClick={() => deleteNode()} title="Excluir questão" aria-label="Excluir questão">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return (
    <NodeViewWrapper className="group relative my-3" data-testid="question-node" data-question-expanded={String(expanded)}>
      {expanded ? (
        <QuestionCard
          num={ordinal}
          answer={answer}
          instruction={instruction}
          enunciado={enunciado}
          enunciadoPosition={enunciadoPosition}
          disabled={disabled}
          onCommit={handleCommit}
          onCancel={handleCancel}
          stem={<NodeViewContent />}
        />
      ) : (
        <QuestionPreview
          num={ordinal}
          answer={answer}
          instruction={instruction}
          enunciado={enunciado}
          enunciadoPosition={enunciadoPosition}
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
