/**
 * Contrato de paridade da COLUNA DO MARCADOR de alternativa (achado 0340).
 *
 * O achado 0202 unificou só a LARGURA do marcador (`ALTERNATIVE_MARKER_CLASS`);
 * o vão entre o ordinal e o texto continuou escrito à mão, uma vez por
 * superfície, e as cópias discordavam: `gap-2.5` (10px) na folha do Revisar
 * contra `gap-2` (8px) na prévia do Exportar. O texto da alternativa começava
 * 2px mais à direita justamente na tela onde o professor julga como o documento
 * sai impresso, e cada linha tinha menos largura útil do que teria no papel —
 * mudando onde a linha quebra em alternativa longa.
 *
 * O ponto único agora é a COLUNA INTEIRA: `ALTERNATIVE_MARKER_COLUMN_PT` é o que
 * o PDF já imprimia (22pt do x do ordinal ao x do texto), a largura em `em` do
 * marcador da tela é derivada dela menos o vão, e o vão sai de
 * `ALTERNATIVE_MARKER_GAP_PX` nas duas telas.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import {
  BASE_FONT_PT,
  ALTERNATIVE_MARKER_COLUMN_PT,
  ALTERNATIVE_MARKER_GAP_PX,
  ALTERNATIVE_MARKER_GAP_PT,
  ALTERNATIVE_MARKER_WIDTH_EM,
} from "./pageTokens";
import { ALTERNATIVE_MARKER_CLASS } from "./answers/markerColumn";
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

/** Estilo do marcador da primeira linha na árvore react-pdf de PdfAnswer. */
function firstMarkerStyle(node: ReactElement): { width?: number } {
  const rows = (node.props as { children: ReactElement[] }).children;
  const cells = (rows[0].props as { children: ReactElement[] }).children;
  return (cells[0].props as { style: { width?: number } }).style;
}

describe("coluna do marcador de alternativa — paridade entre as três superfícies", () => {
  it("converte o vão para pt pela mesma razão 72/96 usada no resto do PDF", () => {
    expect(ALTERNATIVE_MARKER_GAP_PT).toBeCloseTo(ALTERNATIVE_MARKER_GAP_PX * (72 / 96), 5);
  });

  it("deriva a largura do marcador da tela da coluna do papel menos o vão", () => {
    expect(ALTERNATIVE_MARKER_WIDTH_EM * BASE_FONT_PT + ALTERNATIVE_MARKER_GAP_PT).toBeCloseTo(
      ALTERNATIVE_MARKER_COLUMN_PT,
      2,
    );
  });

  it("escreve a largura derivada na classe compartilhada do marcador", () => {
    expect(ALTERNATIVE_MARKER_CLASS).toContain(`w-[${ALTERNATIVE_MARKER_WIDTH_EM}em]`);
  });

  it("recua o texto da alternativa na folha do Revisar por ALTERNATIVE_MARKER_GAP_PX", () => {
    render(<AnswerPreview answer={MC} onChange={() => {}} />);
    const row = screen.getAllByTestId("preview-alternative-marker")[0].parentElement;
    expect(row?.style.columnGap).toBe(`${ALTERNATIVE_MARKER_GAP_PX}px`);
  });

  it("recua o texto da alternativa na prévia do Exportar por ALTERNATIVE_MARKER_GAP_PX", () => {
    render(<MultipleChoiceView answer={MC} />);
    const row = screen.getAllByTestId("alternative-marker")[0].parentElement;
    expect(row?.style.columnGap).toBe(`${ALTERNATIVE_MARKER_GAP_PX}px`);
  });

  it("imprime a coluna do marcador do PDF com ALTERNATIVE_MARKER_COLUMN_PT", () => {
    expect(firstMarkerStyle(PdfAnswer({ answer: MC }) as ReactElement).width).toBe(
      ALTERNATIVE_MARKER_COLUMN_PT,
    );
  });
});
