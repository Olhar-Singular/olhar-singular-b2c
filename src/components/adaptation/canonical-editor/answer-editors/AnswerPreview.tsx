/**
 * AnswerPreview — print-faithful render of a question's answer for the folha "at
 * rest" (plano §6.3). Mirrors what the student receives on paper: lettered
 * alternatives (a/b/c, one per line, same as PdfAnswer and MultipleChoiceView),
 * empty boxes / ruled lines, with NO answer key (D5 — the correct option is
 * indistinguishable). The printed text (alternatives, options, items, cells,
 * pairs) stays editable inline via RichTextField — "se está impresso na folha,
 * clique e digite". Structure (which is correct, add / remove / reorder) lives in
 * the expanded card, not here. `fillBlank` renders nothing: its gaps live inline
 * in the stem text.
 */

import { Fragment, type ComponentProps } from "react";
import type { QuestionAnswer, RichText } from "@/lib/adaptation/canonical/schema";
import { indexToLetter } from "@/components/adaptation/render/letters";
import { ALTERNATIVE_MARKER_CLASS } from "@/components/adaptation/render/answers/markerColumn";
import {
  ANSWER_LINE_COLOR,
  ANSWER_LINE_GAP_PX,
  ANSWER_LINE_WIDTH_PX,
  ANSWER_ITEM_GAP_PX,
  ALTERNATIVE_MARKER_GAP_PX,
  TRUE_FALSE_MARKER_GAP_PX,
  TRUE_FALSE_MARKER_TEXT,
} from "@/components/adaptation/render/pageTokens";
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

function Bullet() {
  return (
    <span
      data-testid="preview-bullet"
      data-shape="square"
      className="mt-1 h-[17px] w-[17px] shrink-0 rounded-[4px] border-[1.5px] border-surface-ink-faint"
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

/**
 * Rótulo acessível de uma célula do corpo da tabela. Cita o nome da coluna
 * (o texto do cabeçalho) para que o leitor de tela diga o que o valor é, e não
 * só a coordenada. Cabeçalho sem texto puro (só fórmula, ou vazio) volta para a
 * coordenada, que é sempre inequívoca.
 */
function tableCellLabel(header: RichText | undefined, rowIndex: number, colIndex: number): string {
  const name = (header ?? [])
    .map((node) => (node.type === "text" ? node.text : ""))
    .join("")
    .trim();
  return name
    ? `Célula, ${name}, linha ${rowIndex + 1}`
    : `Célula linha ${rowIndex + 1} coluna ${colIndex + 1}`;
}

export function AnswerPreview({ answer, onChange, disabled = false }: AnswerPreviewProps) {
  switch (answer.kind) {
    case "multipleChoice":
      return (
        <div
          className="flex flex-col"
          style={{ rowGap: `${ANSWER_ITEM_GAP_PX}px` }}
          data-testid="answer-preview-multipleChoice"
        >
          {answer.alternatives.map((alt, i) => (
            <div
              key={alt.id}
              className="flex min-w-0 items-start"
              style={{ columnGap: `${ALTERNATIVE_MARKER_GAP_PX}px` }}
            >
              <span data-testid="preview-alternative-marker" className={ALTERNATIVE_MARKER_CLASS}>
                {indexToLetter(i)})
              </span>
              <PreviewField
                value={alt.content}
                disabled={disabled}
                onChange={(rt) => onChange(setAlternativeContent(answer, alt.id, rt))}
                placeholder="Alternativa"
                ariaLabel={`Alternativa ${indexToLetter(i)}`}
              />
            </div>
          ))}
        </div>
      );

    case "checkbox":
      return (
        <div className="flex flex-col gap-2" data-testid="answer-preview-checkbox">
          {answer.items.map((item, i) => (
            <div key={item.id} className="flex min-w-0 items-start gap-2.5">
              <Bullet />
              <PreviewField
                value={item.content}
                disabled={disabled}
                onChange={(rt) => onChange(setCheckboxContent(answer, item.id, rt))}
                placeholder="Opção"
                ariaLabel={`Opção ${i + 1}`}
              />
            </div>
          ))}
        </div>
      );

    case "trueFalse":
      return (
        <div className="flex flex-col gap-2.5" data-testid="answer-preview-trueFalse">
          {answer.items.map((item, i) => (
            <div
              key={item.id}
              className="flex min-w-0 items-start"
              style={{ columnGap: `${TRUE_FALSE_MARKER_GAP_PX}px` }}
            >
              <span
                data-testid="preview-true-false-marker"
                className="shrink-0 font-medium"
                aria-label="Marque Verdadeiro ou Falso"
              >
                {TRUE_FALSE_MARKER_TEXT}
              </span>
              <div className="min-w-0 flex-1">
                <PreviewField
                  value={item.content}
                  disabled={disabled}
                  onChange={(rt) => onChange(setTrueFalseContent(answer, item.id, rt))}
                  placeholder="Afirmação"
                  ariaLabel={`Afirmação ${i + 1}`}
                />
              </div>
            </div>
          ))}
        </div>
      );

    case "ordering":
      return (
        <div className="flex flex-col gap-2.5" data-testid="answer-preview-ordering">
          {answer.items.map((item, i) => (
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
                ariaLabel={`Item ${i + 1}`}
              />
            </div>
          ))}
        </div>
      );

    case "matching":
      return (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-4 gap-y-2.5" data-testid="answer-preview-matching">
          {answer.pairs.map((pair, i) => (
            <Fragment key={pair.id}>
              <PreviewField
                value={pair.left}
                disabled={disabled}
                onChange={(rt) => onChange(setMatchingSide(answer, pair.id, "left", rt))}
                placeholder="Coluna A"
                ariaLabel={`Coluna A, par ${i + 1}`}
              />
              <span className="text-surface-ink-faint">↔</span>
              <PreviewField
                value={pair.right}
                disabled={disabled}
                onChange={(rt) => onChange(setMatchingSide(answer, pair.id, "right", rt))}
                placeholder="Coluna B"
                ariaLabel={`Coluna B, par ${i + 1}`}
              />
            </Fragment>
          ))}
        </div>
      );

    case "table": {
      // rows[0] é cabeçalho — mesma leitura da prévia (TableView), do PDF
      // (PdfAnswer) e do Word (exportDocx). Aqui isso precisa ser visível E
      // semântico: sem <th scope="col"> o leitor de tela anuncia a tabela sem
      // nome de coluna, e sem peso o professor edita sem saber qual linha vira
      // cabeçalho no arquivo. O peso (font-semibold, sem fundo) é o que o PDF
      // imprime, então a folha na tela continua igual ao papel.
      const [header, ...body] = answer.rows;
      return (
        <table className="w-full border-collapse" data-testid="answer-preview-table">
          {header && (
            <thead>
              <tr>
                {header.map((cell, ci) => (
                  <th
                    key={ci}
                    scope="col"
                    className="min-w-[60px] border border-surface-line-2 p-1.5 text-left align-top font-semibold"
                  >
                    <PreviewField
                      value={cell}
                      disabled={disabled}
                      onChange={(rt) => onChange(setTableCell(answer, 0, ci, rt))}
                      placeholder="Cabeçalho"
                      ariaLabel={`Cabeçalho da coluna ${ci + 1}`}
                    />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="min-w-[60px] border border-surface-line-2 p-1.5 align-top">
                    <PreviewField
                      value={cell}
                      disabled={disabled}
                      onChange={(rt) => onChange(setTableCell(answer, ri + 1, ci, rt))}
                      placeholder="Célula"
                      ariaLabel={tableCellLabel(header?.[ci], ri, ci)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    case "fillBlank":
      return null;

    /* v8 ignore next 2 -- exhaustive switch; "open" is the only remaining kind */
    case "open":
    default: {
      const lines = answer.answerLines ?? 3;
      return (
        <div
          className="flex flex-col pt-1.5"
          style={{ rowGap: `${ANSWER_LINE_GAP_PX}px` }}
          data-testid="answer-preview-open"
        >
          {Array.from({ length: lines }, (_, i) => (
            <div
              key={i}
              data-testid="preview-answer-line"
              className="h-px border-b border-dashed"
              style={{
                borderBottomColor: ANSWER_LINE_COLOR,
                borderBottomWidth: `${ANSWER_LINE_WIDTH_PX}px`,
              }}
            />
          ))}
        </div>
      );
    }
  }
}

export default AnswerPreview;
