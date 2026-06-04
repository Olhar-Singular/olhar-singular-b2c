/**
 * AnswerEditor — interactive editor for a question's discriminated `answer`.
 *
 * Presentational only: it renders the correct UI per `answer.kind` and dispatches
 * the pure `answerOps` mutations, calling `onChange` with the new answer. All the
 * mutation logic lives in `answerOps.ts` (100% unit-tested).
 */

import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { richTextToPlain } from "../richText";
import {
  setCorrectAlternative,
  addAlternative,
  removeAlternative,
  setAlternativeText,
  setTrueFalseValue,
  setTrueFalseText,
  toggleCheckbox,
  setCheckboxText,
  setMatchingSide,
  addMatchingPair,
  removeMatchingPair,
  setOrderingText,
  reorderOrdering,
  setGapAnswer,
  addGap,
  removeGap,
  setAnswerLines,
  setTableCell,
} from "./answerOps";

interface AnswerEditorProps {
  answer: QuestionAnswer;
  onChange: (answer: QuestionAnswer) => void;
  disabled?: boolean;
}

function IconButton({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onClick} title={title} disabled={disabled}>
      {children}
    </Button>
  );
}

export function AnswerEditor({ answer, onChange, disabled = false }: AnswerEditorProps) {
  switch (answer.kind) {
    case "multipleChoice":
      return (
        <div className="flex flex-col gap-1.5" data-testid="answer-multipleChoice">
          {answer.alternatives.map((alt) => (
            <div key={alt.id} className="flex items-center gap-2">
              <input
                type="radio"
                name={`mc-correct`}
                checked={alt.correct}
                disabled={disabled}
                onChange={() => onChange(setCorrectAlternative(answer, alt.id))}
                title="Marcar como correta"
                aria-label="Marcar como correta"
              />
              <Input
                value={richTextToPlain(alt.content)}
                disabled={disabled}
                onChange={(e) => onChange(setAlternativeText(answer, alt.id, e.target.value))}
                placeholder="Alternativa"
              />
              <IconButton onClick={() => onChange(removeAlternative(answer, alt.id))} title="Remover alternativa" disabled={disabled}>
                <Trash2 className="w-3.5 h-3.5" />
              </IconButton>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="self-start gap-1" onClick={() => onChange(addAlternative(answer))} disabled={disabled}>
            <Plus className="w-3.5 h-3.5" /> Alternativa
          </Button>
        </div>
      );

    case "trueFalse":
      return (
        <div className="flex flex-col gap-1.5" data-testid="answer-trueFalse">
          {answer.items.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <Input
                value={richTextToPlain(item.content)}
                disabled={disabled}
                onChange={(e) => onChange(setTrueFalseText(answer, item.id, e.target.value))}
                placeholder="Afirmação"
              />
              <Button
                type="button"
                variant={item.value ? "default" : "outline"}
                size="sm"
                onClick={() => onChange(setTrueFalseValue(answer, item.id, !item.value))}
                disabled={disabled}
                title="Alternar Verdadeiro/Falso"
              >
                {item.value ? "V" : "F"}
              </Button>
            </div>
          ))}
        </div>
      );

    case "checkbox":
      return (
        <div className="flex flex-col gap-1.5" data-testid="answer-checkbox">
          {answer.items.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <Checkbox
                checked={item.checked}
                disabled={disabled}
                onCheckedChange={() => onChange(toggleCheckbox(answer, item.id))}
                aria-label="Marcar opção"
              />
              <Input
                value={richTextToPlain(item.content)}
                disabled={disabled}
                onChange={(e) => onChange(setCheckboxText(answer, item.id, e.target.value))}
                placeholder="Opção"
              />
            </div>
          ))}
        </div>
      );

    case "matching":
      return (
        <div className="flex flex-col gap-1.5" data-testid="answer-matching">
          {answer.pairs.map((pair) => (
            <div key={pair.id} className="flex items-center gap-2">
              <Input
                value={richTextToPlain(pair.left)}
                disabled={disabled}
                onChange={(e) => onChange(setMatchingSide(answer, pair.id, "left", e.target.value))}
                placeholder="Coluna A"
              />
              <span className="text-muted-foreground">↔</span>
              <Input
                value={richTextToPlain(pair.right)}
                disabled={disabled}
                onChange={(e) => onChange(setMatchingSide(answer, pair.id, "right", e.target.value))}
                placeholder="Coluna B"
              />
              <IconButton onClick={() => onChange(removeMatchingPair(answer, pair.id))} title="Remover par" disabled={disabled}>
                <Trash2 className="w-3.5 h-3.5" />
              </IconButton>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="self-start gap-1" onClick={() => onChange(addMatchingPair(answer))} disabled={disabled}>
            <Plus className="w-3.5 h-3.5" /> Par
          </Button>
        </div>
      );

    case "ordering":
      return (
        <div className="flex flex-col gap-1.5" data-testid="answer-ordering">
          {answer.items.map((item, index) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-5">{index + 1}.</span>
              <Input
                value={richTextToPlain(item.content)}
                disabled={disabled}
                onChange={(e) => onChange(setOrderingText(answer, item.id, e.target.value))}
                placeholder="Item"
              />
              <IconButton onClick={() => onChange(reorderOrdering(answer, index, index - 1))} title="Mover para cima" disabled={disabled}>
                <ArrowUp className="w-3.5 h-3.5" />
              </IconButton>
              <IconButton onClick={() => onChange(reorderOrdering(answer, index, index + 1))} title="Mover para baixo" disabled={disabled}>
                <ArrowDown className="w-3.5 h-3.5" />
              </IconButton>
            </div>
          ))}
        </div>
      );

    case "fillBlank":
      return (
        <div className="flex flex-col gap-1.5" data-testid="answer-fillBlank">
          {answer.gaps.map((gap, index) => (
            <div key={gap.id} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-12">Lacuna {index + 1}</span>
              <Input
                value={gap.answer}
                disabled={disabled}
                onChange={(e) => onChange(setGapAnswer(answer, gap.id, e.target.value))}
                placeholder="Resposta"
              />
              <IconButton onClick={() => onChange(removeGap(answer, gap.id))} title="Remover lacuna" disabled={disabled}>
                <Trash2 className="w-3.5 h-3.5" />
              </IconButton>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="self-start gap-1" onClick={() => onChange(addGap(answer))} disabled={disabled}>
            <Plus className="w-3.5 h-3.5" /> Lacuna
          </Button>
        </div>
      );

    case "table":
      return (
        <div className="flex flex-col gap-1" data-testid="answer-table">
          {answer.rows.map((row, ri) => (
            <div key={ri} className="flex gap-1">
              {row.map((cell, ci) => (
                <Input
                  key={ci}
                  value={richTextToPlain(cell)}
                  disabled={disabled}
                  onChange={(e) => onChange(setTableCell(answer, ri, ci, e.target.value))}
                  placeholder="Célula"
                />
              ))}
            </div>
          ))}
        </div>
      );

    /* v8 ignore next 2 -- exhaustive switch; "open" is the only remaining kind */
    case "open":
    default:
      return (
        <div className="flex items-center gap-2" data-testid="answer-open">
          <span className="text-xs text-muted-foreground">Linhas de resposta:</span>
          <Input
            type="number"
            min={0}
            className="w-20"
            value={answer.answerLines ?? 0}
            disabled={disabled}
            onChange={(e) => onChange(setAnswerLines(answer, Number(e.target.value)))}
          />
        </div>
      );
  }
}
