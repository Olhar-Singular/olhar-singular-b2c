/**
 * QuestionCard — the expanded ("editar estrutura") state of a question (plano
 * §6.3 / D4). Accent shell with a "Questão N" bar, the editable stem (passed in
 * as the live NodeViewContent slot), a named Instrução field (with remove / add),
 * the full AnswerEditor (structure + answer key), and footer with Cancelar/Concluir.
 *
 * Answer, instruction and enunciado edits are buffered in LOCAL state — they are
 * only written to the Tiptap document when the teacher clicks Concluir (via
 * onCommit). Clicking Cancelar discards those local changes without touching the
 * document; the parent is responsible for restoring any stem-content edits that
 * happened live.
 *
 * Tiptap note: only the stem slot is outer-editor content. Every other section is
 * chrome and must be contentEditable={false} so ProseMirror does not treat it as
 * editable text — nested editors (RichTextField) re-enable editing on themselves.
 */

import { useState } from "react";
import { AlignStartVertical, AlignEndVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { QuestionAnswer, RichText } from "@/lib/adaptation/canonical/schema";
import { AnswerEditor } from "../answer-editors/AnswerEditor";
import { changeAnswerKind } from "../answer-editors/answerOps";
import { QUESTION_KINDS, type QuestionKind } from "../questionKinds";
import { RichTextField } from "../RichTextField";

type EnunciadoPosition = "above" | "below";

interface QuestionCardProps {
  num: number | undefined;
  /** Optional custom number override (e.g. "1a"). Null → auto from position. */
  customNumber?: string | null;
  /** Initial answer value — buffered locally until Concluir. */
  answer: QuestionAnswer;
  /** Initial instruction value — buffered locally until Concluir. */
  instruction: RichText | null;
  /** Initial enunciado value — buffered locally until Concluir. */
  enunciado: RichText | null;
  /** Initial enunciado position — buffered locally until Concluir. */
  enunciadoPosition: EnunciadoPosition;
  disabled: boolean;
  /** Called on Concluir with the committed answer, instruction, enunciado, position and customNumber. */
  onCommit: (
    answer: QuestionAnswer,
    instruction: RichText | null,
    enunciado: RichText | null,
    enunciadoPosition: EnunciadoPosition,
    customNumber: string | null,
  ) => void;
  /** Called on Cancelar — the parent is responsible for restoring stem content. */
  onCancel: () => void;
  stem: React.ReactNode;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-surface-ink-faint">
      {children}
    </div>
  );
}

export function QuestionCard({
  num,
  customNumber = null,
  answer,
  instruction,
  enunciado,
  enunciadoPosition,
  disabled,
  onCommit,
  onCancel,
  stem,
}: QuestionCardProps) {
  const [localAnswer, setLocalAnswer] = useState<QuestionAnswer>(answer);
  const [localInstruction, setLocalInstruction] = useState<RichText | null>(instruction);
  const [localEnunciado, setLocalEnunciado] = useState<RichText | null>(enunciado);
  const [localPosition, setLocalPosition] = useState<EnunciadoPosition>(enunciadoPosition);
  const [localCustomNumber, setLocalCustomNumber] = useState<string | null>(customNumber);
  // Local "adding" reveals the instruction field before any text is persisted.
  const [adding, setAdding] = useState(false);
  const showInstruction = localInstruction != null || adding;
  const currentLabel = QUESTION_KINDS.find((k) => k.kind === localAnswer.kind)!.label;

  return (
    <div
      data-testid="question-card"
      className="my-0.5 overflow-hidden rounded-[10px] border border-surface-accent bg-surface-paper shadow-[0_8px_28px_rgba(44,90,160,0.13)]"
    >
      <div
        contentEditable={false}
        className="flex items-center gap-2.5 border-b border-surface-accent-soft bg-surface-accent-soft px-4 py-2.5"
      >
        <span className="text-[13px] font-semibold text-surface-accent-ink">
          Questão{" "}
          <input
            type="text"
            aria-label="Número da questão"
            data-testid="question-number-input"
            value={localCustomNumber ?? (num?.toString() ?? "")}
            onChange={(e) => setLocalCustomNumber(e.target.value.trim() || null)}
            placeholder={num?.toString() ?? ""}
            disabled={disabled}
            className="inline-block w-8 bg-transparent text-center outline-none border-b border-surface-accent focus:border-surface-accent-ink disabled:opacity-60"
          />
        </span>
        <Select
          value={localAnswer.kind}
          onValueChange={(kind) => setLocalAnswer(changeAnswerKind(localAnswer, kind as QuestionKind))}
          disabled={disabled}
        >
          <SelectTrigger
            data-testid="question-type-trigger"
            title="Tipo da questão"
            className="ml-auto h-7 w-auto gap-1 border-0 bg-transparent px-2 text-[12.5px] font-medium text-surface-accent-ink shadow-none hover:bg-surface-paper/60 focus:ring-1 focus:ring-surface-accent"
          >
            {currentLabel}
          </SelectTrigger>
          <SelectContent>
            {QUESTION_KINDS.map(({ kind, label }) => (
              <SelectItem key={kind} value={kind}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">

        {/* Enunciado acima do stem */}
        {localEnunciado !== null && localPosition === "above" && (
          <div contentEditable={false}>
            <FieldLabel>
              Enunciado
              <button
                type="button"
                className="ml-auto text-[11px] font-medium normal-case tracking-normal text-surface-ink-faint hover:text-destructive disabled:opacity-50"
                disabled={disabled}
                onClick={() => setLocalEnunciado(null)}
                aria-label="Remover enunciado"
              >
                remover ×
              </button>
            </FieldLabel>
            <div className="mb-1 flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="default"
                className="h-6 w-6"
                disabled={disabled}
                onClick={() => setLocalPosition("above")}
                aria-label="Enunciado acima da imagem"
                title="Acima"
              >
                <AlignStartVertical className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                disabled={disabled}
                onClick={() => setLocalPosition("below")}
                aria-label="Enunciado abaixo da imagem"
                title="Abaixo"
              >
                <AlignEndVertical className="h-3.5 w-3.5" />
              </Button>
            </div>
            <RichTextField
              value={localEnunciado}
              placeholder="Escreva o enunciado da questão…"
              disabled={disabled}
              onChange={(rt) => setLocalEnunciado(rt.length > 0 ? rt : null)}
              ariaLabel="Enunciado da questão"
            />
          </div>
        )}

        <div>
          <div contentEditable={false}>
            <FieldLabel>Imagem / Conteúdo</FieldLabel>
          </div>
          {stem}
        </div>

        {/* Enunciado abaixo do stem */}
        {localEnunciado !== null && localPosition === "below" && (
          <div contentEditable={false}>
            <FieldLabel>
              Enunciado
              <button
                type="button"
                className="ml-auto text-[11px] font-medium normal-case tracking-normal text-surface-ink-faint hover:text-destructive disabled:opacity-50"
                disabled={disabled}
                onClick={() => setLocalEnunciado(null)}
                aria-label="Remover enunciado"
              >
                remover ×
              </button>
            </FieldLabel>
            <div className="mb-1 flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                disabled={disabled}
                onClick={() => setLocalPosition("above")}
                aria-label="Enunciado acima da imagem"
                title="Acima"
              >
                <AlignStartVertical className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="default"
                className="h-6 w-6"
                disabled={disabled}
                onClick={() => setLocalPosition("below")}
                aria-label="Enunciado abaixo da imagem"
                title="Abaixo"
              >
                <AlignEndVertical className="h-3.5 w-3.5" />
              </Button>
            </div>
            <RichTextField
              value={localEnunciado}
              placeholder="Escreva o enunciado da questão…"
              disabled={disabled}
              onChange={(rt) => setLocalEnunciado(rt.length > 0 ? rt : null)}
              ariaLabel="Enunciado da questão"
            />
          </div>
        )}

        {/* Botão adicionar enunciado (quando não existe) */}
        {localEnunciado === null && (
          <div contentEditable={false}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 self-start border border-dashed border-surface-accent/40 text-surface-accent hover:border-surface-accent hover:bg-surface-accent hover:text-white"
              disabled={disabled}
              onClick={() => { setLocalEnunciado([]); setLocalPosition("below"); }}
              aria-label="Adicionar enunciado"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar enunciado
            </Button>
          </div>
        )}

        <div contentEditable={false}>
          <FieldLabel>
            Instrução
            {showInstruction && (
              <button
                type="button"
                className="ml-auto text-[11px] font-medium normal-case tracking-normal text-surface-ink-faint hover:text-destructive disabled:opacity-50"
                disabled={disabled}
                onClick={() => {
                  setLocalInstruction(null);
                  setAdding(false);
                }}
                aria-label="Remover instrução"
              >
                remover ×
              </button>
            )}
          </FieldLabel>
          {showInstruction ? (
            <RichTextField
              value={localInstruction ?? []}
              placeholder="Ex.: Marque a resposta correta."
              disabled={disabled}
              onChange={(rt) => setLocalInstruction(rt.length > 0 ? rt : null)}
              ariaLabel="Instrução da questão"
            />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 self-start border border-dashed border-surface-accent/40 text-surface-accent hover:border-surface-accent hover:bg-surface-accent hover:text-white"
              disabled={disabled}
              onClick={() => setAdding(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar instrução
            </Button>
          )}
        </div>

        <div contentEditable={false}>
          <AnswerEditor answer={localAnswer} disabled={disabled} onChange={setLocalAnswer} />
        </div>
      </div>

      <div contentEditable={false} className="flex justify-end gap-2 border-t border-surface-line px-4 py-3">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          className="text-surface-ink-soft hover:text-surface-ink"
          aria-label="Cancelar edição"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onCommit(localAnswer, localInstruction, localEnunciado, localPosition, localCustomNumber)}
          className="bg-surface-accent text-white hover:bg-surface-accent-ink"
        >
          Concluir
        </Button>
      </div>
    </div>
  );
}

export default QuestionCard;
