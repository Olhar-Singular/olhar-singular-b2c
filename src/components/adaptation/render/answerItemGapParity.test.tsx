/**
 * Contrato de paridade do ESPAÇAMENTO entre ITENS DE RESPOSTA (achado 0313).
 *
 * O vão entre uma alternativa e a seguinte era escrito à mão três vezes: `gap-2`
 * (8px) na folha do Revisar, `space-y-2` (8px) na prévia do Exportar e
 * `marginBottom: 3` (3pt = 4px) no PDF. As duas telas concordavam e o papel — o
 * que o aluno recebe — saía com a lista ~14% mais compacta por linha, então o
 * professor não conseguia prever a paginação pela tela.
 *
 * `ANSWER_ITEM_GAP_PX` é o ponto único, como já acontece com `ANSWER_LINE_GAP_PX`
 * para a pauta da questão aberta; o PDF consome o mesmo valor convertido para pt.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { ANSWER_ITEM_GAP_PX, ANSWER_ITEM_GAP_PT } from "./pageTokens";
import { MultipleChoiceView } from "./answers/MultipleChoiceView";
import { PdfAnswer } from "./pdf/PdfAnswer";
import { AnswerPreview } from "../canonical-editor/answer-editors/AnswerPreview";

vi.mock("../canonical-editor/RichTextField", () => ({
  RichTextField: () => <input />,
}));

const MC: Extract<QuestionAnswer, { kind: "multipleChoice" }> = {
  kind: "multipleChoice",
  alternatives: [
    { id: "a1", content: [], correct: true },
    { id: "a2", content: [], correct: false },
  ],
};

/** Estilo da primeira linha de item na árvore react-pdf devolvida por PdfAnswer. */
function firstRowStyle(node: ReactElement): { marginBottom?: number } {
  const children = (node.props as { children: ReactElement[] }).children;
  return (children[0].props as { style: { marginBottom?: number } }).style;
}

describe("itens de resposta — paridade de espaçamento entre as três superfícies", () => {
  it("converte o gap para pt pela mesma razão 72/96 usada no resto do PDF", () => {
    expect(ANSWER_ITEM_GAP_PT).toBeCloseTo(ANSWER_ITEM_GAP_PX * (72 / 96), 5);
  });

  it("espaça as alternativas da folha do Revisar por ANSWER_ITEM_GAP_PX", () => {
    render(<AnswerPreview answer={MC} onChange={() => {}} />);
    const container = screen.getByTestId("answer-preview-multipleChoice");
    expect(container.style.rowGap).toBe(`${ANSWER_ITEM_GAP_PX}px`);
  });

  it("espaça as alternativas da prévia do Exportar por ANSWER_ITEM_GAP_PX", () => {
    render(<MultipleChoiceView answer={MC} />);
    const container = screen.getByTestId("answer-multipleChoice");
    expect(container.style.rowGap).toBe(`${ANSWER_ITEM_GAP_PX}px`);
  });

  it("espaça as alternativas do PDF pelo equivalente em pt de ANSWER_ITEM_GAP_PX", () => {
    expect(firstRowStyle(PdfAnswer({ answer: MC }) as ReactElement).marginBottom).toBe(
      ANSWER_ITEM_GAP_PT,
    );
  });
});
