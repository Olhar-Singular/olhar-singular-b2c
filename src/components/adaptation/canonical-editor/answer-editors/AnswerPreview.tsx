/**
 * AnswerPreview — print-faithful render of a question's answer for the folha "at
 * rest" (plano §6.3). Mirrors what the student receives on paper: empty bullets /
 * boxes / ruled lines, with NO answer key (D5 — the correct option is
 * indistinguishable). The printed text (alternatives, options, items, cells,
 * pairs) stays editable inline via RichTextField — "se está impresso na folha,
 * clique e digite". Structure (which is correct, add / remove / reorder) lives in
 * the expanded card, not here. `fillBlank` renders nothing: its gaps live inline
 * in the stem text.
 */

import { Fragment, type ComponentProps } from "react";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { RichTextField } from "../RichTextField";
import {
  setAlternativeContent,
  setCheckboxContent,
  setTrueFalseContent,
  setOrderingContent,
  setMatchingSide,
  setTableCell,
} from "./answerOps";

interface AnswerPreviewProps {
  answer: QuestionAnswer;
  onChange: (answer: QuestionAnswer) => void;
  disabled?: boolean;
}

function Bullet({ shape }: { shape: "round" | "square" }) {
  return (
    <span
      data-testid="preview-bullet"
      data-shape={shape}
      className={`mt-1 h-[17px] w-[17px] shrink-0 border-[1.5px] border-surface-ink-faint ${
        shape === "round" ? "rounded-full" : "rounded-[4px]"
      }`}
    />
  );
}

/**
 * In the preview the printed text reads like the PDF — no input chrome — so every
 * editable answer field uses RichTextField's `plain` variant.
 */
function PreviewField(props: ComponentProps<typeof RichTextField>) {
  return <RichTextField {...props} plain />;
}

export function AnswerPreview({ answer, onChange, disabled = false }: AnswerPreviewProps) {
  switch (answer.kind) {
    case "multipleChoice":
      return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-x-7" data-testid="answer-preview-multipleChoice">
          {answer.alternatives.map((alt) => (
            <div key={alt.id} className="flex min-w-0 items-start gap-2.5">
              <Bullet shape="round" />
              <PreviewField
                value={alt.content}
                disabled={disabled}
                onChange={(rt) => onChange(setAlternativeContent(answer, alt.id, rt))}
                placeholder="Alternativa"
                ariaLabel="Alternativa"
              />
            </div>
          ))}
        </div>
      );

    case "checkbox":
      return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-x-7" data-testid="answer-preview-checkbox">
          {answer.items.map((item) => (
            <div key={item.id} className="flex min-w-0 items-start gap-2.5">
              <Bullet shape="square" />
              <PreviewField
                value={item.content}
                disabled={disabled}
                onChange={(rt) => onChange(setCheckboxContent(answer, item.id, rt))}
                placeholder="Opção"
                ariaLabel="Opção"
              />
            </div>
          ))}
        </div>
      );

    case "trueFalse":
      return (
        <div className="flex flex-col gap-2.5" data-testid="answer-preview-trueFalse">
          {answer.items.map((item) => (
            <div key={item.id} className="flex min-w-0 items-start gap-3">
              <span className="flex shrink-0 items-center gap-3 pt-0.5 text-sm text-surface-ink-soft">
                <span className="flex items-center gap-1">
                  <span className="h-[17px] w-[17px] rounded-full border-[1.5px] border-surface-ink-faint" />
                  <span>V</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-[17px] w-[17px] rounded-full border-[1.5px] border-surface-ink-faint" />
                  <span>F</span>
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <PreviewField
                  value={item.content}
                  disabled={disabled}
                  onChange={(rt) => onChange(setTrueFalseContent(answer, item.id, rt))}
                  placeholder="Afirmação"
                  ariaLabel="Afirmação"
                />
              </div>
            </div>
          ))}
        </div>
      );

    case "ordering":
      return (
        <div className="flex flex-col gap-2.5" data-testid="answer-preview-ordering">
          {answer.items.map((item) => (
            <div key={item.id} className="flex min-w-0 items-center gap-2.5">
              <span
                data-testid="preview-order-box"
                className="h-6 w-6 shrink-0 rounded-[5px] border-[1.5px] border-surface-ink-faint"
              />
              <PreviewField
                value={item.content}
                disabled={disabled}
                onChange={(rt) => onChange(setOrderingContent(answer, item.id, rt))}
                placeholder="Item"
                ariaLabel="Item"
              />
            </div>
          ))}
        </div>
      );

    case "matching":
      return (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-4 gap-y-2.5" data-testid="answer-preview-matching">
          {answer.pairs.map((pair) => (
            <Fragment key={pair.id}>
              <PreviewField
                value={pair.left}
                disabled={disabled}
                onChange={(rt) => onChange(setMatchingSide(answer, pair.id, "left", rt))}
                placeholder="Coluna A"
                ariaLabel="Coluna A"
              />
              <span className="text-surface-ink-faint">↔</span>
              <PreviewField
                value={pair.right}
                disabled={disabled}
                onChange={(rt) => onChange(setMatchingSide(answer, pair.id, "right", rt))}
                placeholder="Coluna B"
                ariaLabel="Coluna B"
              />
            </Fragment>
          ))}
        </div>
      );

    case "table":
      return (
        <table className="w-full border-collapse" data-testid="answer-preview-table">
          <tbody>
            {answer.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="min-w-[60px] border border-surface-line-2 p-1.5 align-top">
                    <PreviewField
                      value={cell}
                      disabled={disabled}
                      onChange={(rt) => onChange(setTableCell(answer, ri, ci, rt))}
                      placeholder="Célula"
                      ariaLabel="Célula"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );

    case "fillBlank":
      return null;

    /* v8 ignore next 2 -- exhaustive switch; "open" is the only remaining kind */
    case "open":
    default: {
      const lines = answer.answerLines ?? 3;
      return (
        <div className="flex flex-col gap-[18px] pt-1.5" data-testid="answer-preview-open">
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} data-testid="preview-answer-line" className="h-px border-b border-surface-line-2" />
          ))}
        </div>
      );
    }
  }
}

export default AnswerPreview;
