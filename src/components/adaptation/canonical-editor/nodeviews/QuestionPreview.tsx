/**
 * QuestionPreview — the folha "at rest" view of a question (plano §6.3). Shows the
 * positional ordinal ("N."), the editable stem (the live NodeViewContent slot), an
 * optional light inline instruction, and the print-faithful AnswerPreview (no
 * gabarito). The hover rail (✎ editar + move / image / delete) is passed in as a
 * slot. Printed text edits inline; structure lives in the expanded card.
 *
 * Enunciado is displayed read-only at its chosen position (above or below the stem).
 * Editing enunciado is only possible inside the expanded QuestionCard.
 *
 * Tiptap note: only the stem slot is outer-editor content; the ordinal, the inline
 * instruction and the answer are chrome / nested editors → contentEditable={false}.
 */

import { X } from "lucide-react";
import type { QuestionAnswer, RichText } from "@/lib/adaptation/canonical/schema";
import { Button } from "@/components/ui/button";
import { RichTextField } from "../RichTextField";
import { AnswerPreview } from "../answer-editors/AnswerPreview";

interface QuestionPreviewProps {
  num: number | undefined;
  customNumber?: string | null;
  answer: QuestionAnswer;
  instruction: RichText | null;
  enunciado: RichText | null;
  enunciadoPosition: "above" | "below";
  disabled: boolean;
  onAnswerChange: (answer: QuestionAnswer) => void;
  onInstructionChange: (instruction: RichText | null) => void;
  stem: React.ReactNode;
  rail: React.ReactNode;
}

export function QuestionPreview({
  num,
  customNumber = null,
  answer,
  instruction,
  enunciado,
  enunciadoPosition,
  disabled,
  onAnswerChange,
  onInstructionChange,
  stem,
  rail,
}: QuestionPreviewProps) {
  const displayNumber = customNumber ?? (num != null ? num.toString() : "");
  const hasEnunciado = enunciado != null && enunciado.length > 0;

  const enunciadoNode = hasEnunciado ? (
    <div contentEditable={false} className="text-surface-ink" data-testid="question-enunciado" style={{ fontSize: "var(--doc-fs-stem, inherit)" }}>
      <RichTextField
        value={enunciado}
        readOnly={true}
        onChange={() => {}}
        ariaLabel="Enunciado da questão"
        plain
        noBubble={true}
      />
    </div>
  ) : null;

  return (
    <div className="relative">
      {rail}
      <div className="flex items-baseline gap-2.5">
        <span data-testid="question-ordinal" contentEditable={false} className="shrink-0 font-bold text-surface-ink">
          {displayNumber ? `${displayNumber}.` : ""}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          {enunciadoPosition === "above" && enunciadoNode}
          <div style={{ fontSize: "var(--doc-fs-stem, inherit)" }}>
            {stem}
          </div>
          {enunciadoPosition === "below" && enunciadoNode}
          {instruction != null && instruction.length > 0 && (
            <div contentEditable={false} className="flex items-start gap-1 italic text-surface-ink-soft" style={{ fontSize: "var(--doc-fs-instruction, 0.94em)" }} data-testid="question-instruction">
              <div className="flex-1">
                <RichTextField
                  value={instruction}
                  disabled={disabled}
                  onChange={(rt) => onInstructionChange(rt.length > 0 ? rt : null)}
                  placeholder="Instrução para responder"
                  ariaLabel="Instrução da questão"
                  plain
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0 text-muted-foreground"
                disabled={disabled}
                onClick={() => onInstructionChange(null)}
                aria-label="Remover instrução"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>
      <div contentEditable={false} className="mt-3" style={{ fontSize: "var(--doc-fs-alternative, inherit)" }}>
        <AnswerPreview answer={answer} disabled={disabled} onChange={onAnswerChange} />
      </div>
    </div>
  );
}

export default QuestionPreview;
