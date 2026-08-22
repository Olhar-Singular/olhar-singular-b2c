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
    // Este container ancora o rail (`absolute`), mas NÃO reserva papel para ele:
    // o rail sobe para o vão entre blocos (`-translate-y-full`, em
    // QuestionNodeView) em vez de cobrir a primeira linha do enunciado em telas
    // estreitas (achado 0205). Reservar a altura dele com `group-hover:pt-9`
    // empurrava o texto 36px sob o ponteiro e esticava a folha justamente
    // durante a edição, quando ela precisa medir o que o PDF mede (0102, 0413).
    <div data-testid="question-preview" className="relative">
      {rail}
      {/* items-start, não items-baseline: a baseline de um <img> é a borda de
          baixo, o que jogava o número ao pé de uma questão que abre com figura.
          gap-2 (8px) espelha `render/blocks/QuestionView`: a folha do Revisar
          tem de medir o mesmo que o impresso, senão o professor não antecipa
          a paginação (achado 0102). */}
      <div className="flex items-start gap-2">
        <span data-testid="question-ordinal" contentEditable={false} className="shrink-0 font-bold text-surface-ink">
          {displayNumber ? `${displayNumber}.` : ""}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {enunciadoPosition === "above" && enunciadoNode}
          <div style={{ fontSize: "var(--doc-fs-stem, inherit)" }}>
            {stem}
          </div>
          {enunciadoPosition === "below" && enunciadoNode}
        </div>
      </div>
      {/* A instrução vive no NÍVEL DO BLOCO, irmã da linha do ordinal — igual a
          `render/blocks/QuestionView` e ao PDF, que a imprimem colada à margem.
          Dentro da coluna do enunciado ela herdava o recuo do ordinal
          (`shrink-0` + gap = 32px) e o Revisar divergia das outras duas
          superfícies (achado 0103). */}
      {instruction != null && instruction.length > 0 && (
        <div contentEditable={false} className="group/instruction mt-2 flex items-start gap-1 italic text-surface-ink-soft" style={{ fontSize: "var(--doc-fs-instruction, 0.875em)" }} data-testid="question-instruction">
          <div className="min-w-0">
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
            className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/instruction:opacity-100 group-focus-within/instruction:opacity-100 focus-visible:opacity-100"
            disabled={disabled}
            onClick={() => onInstructionChange(null)}
            aria-label="Remover instrução"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div contentEditable={false} className="mt-2" style={{ fontSize: "var(--doc-fs-alternative, inherit)" }}>
        <AnswerPreview answer={answer} disabled={disabled} onChange={onAnswerChange} />
      </div>
    </div>
  );
}

export default QuestionPreview;
