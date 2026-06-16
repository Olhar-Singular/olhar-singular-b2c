/**
 * QuestionCard — the expanded ("editar estrutura") state of a question (plano
 * §6.3 / D4). Accent shell with a "Questão N" bar, the editable stem (passed in
 * as the live NodeViewContent slot), a named Instrução field (with remove / add),
 * the full AnswerEditor (structure + answer key), and a Concluir footer.
 *
 * Tiptap note: only the stem slot is outer-editor content. Every other section is
 * chrome and must be contentEditable={false} so ProseMirror does not treat it as
 * editable text — nested editors (RichTextField) re-enable editing on themselves.
 */

import { useState } from "react";
import { Plus } from "lucide-react";
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

interface QuestionCardProps {
  num: number | undefined;
  answer: QuestionAnswer;
  instruction: RichText | null;
  disabled: boolean;
  onAnswerChange: (answer: QuestionAnswer) => void;
  onInstructionChange: (instruction: RichText | null) => void;
  onDone: () => void;
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
  answer,
  instruction,
  disabled,
  onAnswerChange,
  onInstructionChange,
  onDone,
  stem,
}: QuestionCardProps) {
  // Local "adding" reveals the field before any text is persisted, so an empty
  // instruction is never written to the document (keeps the canonical round-trip
  // honest — null stays null until the teacher types).
  const [adding, setAdding] = useState(false);
  const showInstruction = instruction != null || adding;
  const currentLabel = QUESTION_KINDS.find((k) => k.kind === answer.kind)!.label;

  return (
    <div
      data-testid="question-card"
      className="my-0.5 overflow-hidden rounded-[10px] border border-surface-accent bg-surface-paper shadow-[0_8px_28px_rgba(44,90,160,0.13)]"
    >
      <div
        contentEditable={false}
        className="flex items-center gap-2.5 border-b border-surface-accent-soft bg-surface-accent-soft px-4 py-2.5"
      >
        <span className="text-[13px] font-semibold text-surface-accent-ink">Questão {num}</span>
        <Select
          value={answer.kind}
          onValueChange={(kind) => onAnswerChange(changeAnswerKind(answer, kind as QuestionKind))}
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
        <div>
          <div contentEditable={false}>
            <FieldLabel>Enunciado</FieldLabel>
          </div>
          {stem}
        </div>

        <div contentEditable={false}>
          <FieldLabel>
            Instrução
            {showInstruction && (
              <button
                type="button"
                className="ml-auto text-[11px] font-medium normal-case tracking-normal text-surface-ink-faint hover:text-destructive disabled:opacity-50"
                disabled={disabled}
                onClick={() => {
                  onInstructionChange(null);
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
              value={instruction ?? []}
              placeholder="Ex.: Marque a resposta correta."
              disabled={disabled}
              onChange={(rt) => onInstructionChange(rt.length > 0 ? rt : null)}
              ariaLabel="Instrução da questão"
            />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 self-start text-surface-accent hover:bg-surface-accent-soft"
              disabled={disabled}
              onClick={() => setAdding(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar instrução
            </Button>
          )}
        </div>

        <div contentEditable={false}>
          <AnswerEditor answer={answer} disabled={disabled} onChange={onAnswerChange} />
        </div>
      </div>

      <div contentEditable={false} className="flex justify-end border-t border-surface-line px-4 py-3">
        <Button type="button" size="sm" onClick={onDone} className="bg-surface-accent text-white hover:bg-surface-accent-ink">
          Concluir
        </Button>
      </div>
    </div>
  );
}

export default QuestionCard;
