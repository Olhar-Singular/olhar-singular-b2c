/**
 * Contrato de paridade da CÉLULA DE TABELA (achado 0607).
 *
 * A contagem de folhas da prévia do Exportar mede o DOM que ela mesma desenha.
 * Enquanto a célula da prévia usava `text-sm` (14px/20px) e a do PDF o corpo do
 * documento (12pt com `BASE_LINE_HEIGHT`), a mesma tabela media ~9% menos por
 * linha na tela: a prévia anunciava `1 página A4` e o arquivo saía com duas,
 * sem nada avisando que haveria uma virada dentro da tabela.
 *
 * `TABLE_CELL_PADDING_PX` e `RULE_WIDTH_PX` são o ponto único do recuo e do
 * traço; o corpo e a entrelinha vêm do documento nas duas superfícies.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import {
  TABLE_CELL_PADDING_PX,
  TABLE_CELL_PADDING_PT,
  RULE_WIDTH_PX,
  RULE_WIDTH_PT,
  BASE_LINE_HEIGHT,
} from "./pageTokens";
import { TableView } from "./answers/TableView";
import { PdfAnswer } from "./pdf/PdfAnswer";
import { AnswerPreview } from "../canonical-editor/answer-editors/AnswerPreview";

// A folha do Revisar edita inline com ProseMirror; aqui interessa só a CAIXA da
// célula, então o campo vira um input simples.
vi.mock("../canonical-editor/RichTextField", () => ({
  RichTextField: ({ ariaLabel }: { ariaLabel?: string }) => <input aria-label={ariaLabel} readOnly />,
}));

const TABLE: Extract<QuestionAnswer, { kind: "table" }> = {
  kind: "table",
  rows: [
    [[{ type: "text", text: "Termo" }], [{ type: "text", text: "Significado" }]],
    [[{ type: "text", text: "a" }], [{ type: "text", text: "b" }]],
  ],
};

/** Estilo da primeira célula do cabeçalho na árvore react-pdf de PdfAnswer. */
function headerCellStyle(node: ReactElement): Record<string, number | string> {
  // A tabela vem num fragmento: [fio de presença mínima (0193), tabela].
  const table = (node.props as { children: ReactElement[] }).children[1];
  const rows = (table.props as { children: ReactElement[] }).children;
  const cells = (rows[0].props as { children: ReactElement[] }).children;
  return (cells[0].props as { style: Record<string, number | string> }).style;
}

describe("célula de tabela — paridade entre a prévia do Exportar e o PDF", () => {
  it("converte o recuo e o traço para pt pela mesma razão 72/96 do resto do PDF", () => {
    expect(TABLE_CELL_PADDING_PT).toBeCloseTo(TABLE_CELL_PADDING_PX * (72 / 96), 5);
    expect(RULE_WIDTH_PT).toBeCloseTo(RULE_WIDTH_PX * (72 / 96), 5);
  });

  it("desenha a célula da prévia com o corpo do documento, não com um tamanho próprio", () => {
    render(<TableView answer={TABLE} />);
    const cell = screen.getByTestId("answer-table").querySelector("th") as HTMLTableCellElement;
    expect(cell.className).not.toMatch(/text-(xs|sm|base|lg)/);
    expect(cell.style.padding).toBe(`${TABLE_CELL_PADDING_PX}px`);
    expect(cell.style.lineHeight).toBe(String(BASE_LINE_HEIGHT));
    expect(cell.style.borderWidth).toBe(`${RULE_WIDTH_PX}px`);
  });

  it("desenha a célula do PDF com o equivalente em pt dos mesmos tokens", () => {
    const style = headerCellStyle(PdfAnswer({ answer: TABLE }) as ReactElement);
    expect(style.padding).toBe(TABLE_CELL_PADDING_PT);
    expect(style.borderRightWidth).toBe(RULE_WIDTH_PT);
    expect(style.borderBottomWidth).toBe(RULE_WIDTH_PT);
  });
});

/**
 * Contrato de paridade da CÉLULA DE TABELA entre a folha do REVISAR e a prévia
 * do Exportar (achado 0606).
 *
 * O Revisar é a tela em que o professor decide se a atividade cabe na folha.
 * Enquanto a célula do editor tinha recuo próprio (`p-1.5`, 6px) contra os 4px
 * de `TABLE_CELL_PADDING_PX` da prévia, a mesma tabela media até 73% a mais no
 * Revisar: o professor media a virada de página na folha errada.
 */
describe("célula de tabela — paridade entre a folha do Revisar e a prévia", () => {
  function cellBox(el: HTMLTableCellElement) {
    return {
      padding: el.style.padding,
      lineHeight: el.style.lineHeight,
      borderWidth: el.style.borderWidth,
    };
  }

  it("imprime a mesma caixa (recuo, entrelinha e traço) nas duas superfícies", () => {
    const previa = render(<TableView answer={TABLE} />);
    const previaCell = previa.container.querySelector("th") as HTMLTableCellElement;
    const box = cellBox(previaCell);
    previa.unmount();

    const revisar = render(<AnswerPreview answer={TABLE} onChange={() => {}} />);
    const revisarCells = revisar.container.querySelectorAll("th, td");
    expect(revisarCells.length).toBe(4);
    for (const cell of revisarCells) {
      expect(cellBox(cell as HTMLTableCellElement)).toEqual(box);
      expect((cell as HTMLTableCellElement).className).not.toMatch(/\bp-1\.5\b/);
    }
  });
});
