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

import { describe, it, expect } from "vitest";
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

const TABLE: Extract<QuestionAnswer, { kind: "table" }> = {
  kind: "table",
  rows: [
    [[{ type: "text", text: "Termo" }], [{ type: "text", text: "Significado" }]],
    [[{ type: "text", text: "a" }], [{ type: "text", text: "b" }]],
  ],
};

/** Estilo da primeira célula do cabeçalho na árvore react-pdf de PdfAnswer. */
function headerCellStyle(node: ReactElement): Record<string, number | string> {
  const rows = (node.props as { children: ReactElement[] }).children;
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
