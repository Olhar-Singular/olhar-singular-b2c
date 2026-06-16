/**
 * QuestionPreview — the folha "at rest" view of a question (plano §6.3). Shows the
 * positional ordinal ("N."), the editable stem (the live NodeViewContent slot), an
 * optional light inline instruction, and the print-faithful AnswerPreview (no
 * gabarito). The hover rail (✎ editar + move / image / delete) is passed in as a
 * slot. Printed text edits inline; structure lives in the expanded card.
 *
 * Tiptap note: only the stem slot is outer-editor content; the ordinal, the inline
 * instruction and the answer are chrome / nested editors → contentEditable={false}.
 */

import type { QuestionAnswer, RichText } from "@/lib/adaptation/canonical/schema";
import { RichTextField } from "../RichTextField";
import { AnswerPreview } from "../answer-editors/AnswerPreview";

interface QuestionPreviewProps {
  num: number | undefined;
  answer: QuestionAnswer;
  instruction: RichText | null;
  disabled: boolean;
  onAnswerChange: (answer: QuestionAnswer) => void;
  onInstructionChange: (instruction: RichText | null) => void;
  stem: React.ReactNode;
  rail: React.ReactNode;
}

export function QuestionPreview({
  num,
  answer,
  instruction,
  disabled,
  onAnswerChange,
  onInstructionChange,
  stem,
  rail,
}: QuestionPreviewProps) {
  return (
    <div className="relative">
      {rail}
      <div className="flex items-baseline gap-2.5">
        <span data-testid="question-ordinal" contentEditable={false} className="shrink-0 font-bold text-surface-ink">
          {num != null ? `${num}.` : ""}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          {stem}
          {instruction != null && instruction.length > 0 && (
            <div contentEditable={false} className="text-[0.94em] italic text-surface-ink-soft" data-testid="question-instruction">
              <RichTextField
                value={instruction}
                disabled={disabled}
                onChange={(rt) => onInstructionChange(rt.length > 0 ? rt : null)}
                placeholder="Instrução para responder"
                ariaLabel="Instrução da questão"
                plain
              />
            </div>
          )}
        </div>
      </div>
      <div contentEditable={false} className="mt-3">
        <AnswerPreview answer={answer} disabled={disabled} onChange={onAnswerChange} />
      </div>
    </div>
  );
}

export default QuestionPreview;
