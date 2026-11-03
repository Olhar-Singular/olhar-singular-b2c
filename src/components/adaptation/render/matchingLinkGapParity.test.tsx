/**
 * Contrato de paridade do VÃO LATERAL DO ELO da questão de Associação (achado 0197).
 *
 * O vão entre cada coluna de texto e o separador `↔` estava escrito à mão uma vez
 * por superfície, com valores diferentes: `gap-x-4` (16px) na folha do Revisar
 * contra `gap-2` (8px) na prévia do Exportar e `marginHorizontal: 6` pt (= 8px) no
 * PDF. Como as duas colunas são `1fr`, 8px a mais de vão de cada lado encolhe cada
 * coluna em 8px justamente na tela onde o professor edita: o par que ele alinha na
 * folha do Revisar quebra noutro ponto no arquivo que o aluno recebe.
 *
 * `MATCHING_LINK_GAP_PX` é o ponto único das três superfícies, na família de
 * `ALTERNATIVE_MARKER_GAP_PX` e `TRUE_FALSE_MARKER_GAP_PX`; o PDF consome o mesmo
 * valor convertido para pt. O valor adotado é o do papel (6pt = 8px).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { MATCHING_LINK_GAP_PX, MATCHING_LINK_GAP_PT } from "./pageTokens";
import { MatchingView } from "./answers/MatchingView";
import { PdfAnswer } from "./pdf/PdfAnswer";
import { AnswerPreview } from "../canonical-editor/answer-editors/AnswerPreview";

vi.mock("../canonical-editor/RichTextField", () => ({
  RichTextField: () => <input />,
}));

const MATCHING: Extract<QuestionAnswer, { kind: "matching" }> = {
  kind: "matching",
  pairs: [
    { id: "p1", left: [], right: [] },
    { id: "p2", left: [], right: [] },
  ],
};

/** Estilo da caixa do elo (o filho do meio) na primeira linha da árvore react-pdf. */
function linkStyle(node: ReactElement): { marginHorizontal?: number } {
  const rows = (node.props as { children: ReactElement[] }).children;
  const cells = (rows[0].props as { children: ReactElement[] }).children;
  return (cells[1].props as { style: { marginHorizontal?: number } }).style;
}

describe("associação — paridade do vão lateral do elo entre as três superfícies", () => {
  it("converte o vão para pt pela mesma razão 72/96 usada no resto do PDF", () => {
    expect(MATCHING_LINK_GAP_PT).toBeCloseTo(MATCHING_LINK_GAP_PX * (72 / 96), 5);
  });

  it("afasta as colunas do elo na folha do Revisar por MATCHING_LINK_GAP_PX", () => {
    render(<AnswerPreview answer={MATCHING} onChange={() => {}} />);
    expect(screen.getByTestId("answer-preview-matching").style.columnGap).toBe(
      `${MATCHING_LINK_GAP_PX}px`,
    );
  });

  it("afasta as colunas do elo na prévia do Exportar por MATCHING_LINK_GAP_PX", () => {
    render(<MatchingView answer={MATCHING} />);
    const row = screen.getByTestId("answer-matching").firstElementChild as HTMLElement;
    expect(row.style.columnGap).toBe(`${MATCHING_LINK_GAP_PX}px`);
  });

  it("afasta as colunas do elo no PDF pelo equivalente em pt de MATCHING_LINK_GAP_PX", () => {
    expect(linkStyle(PdfAnswer({ answer: MATCHING }) as ReactElement).marginHorizontal).toBe(
      MATCHING_LINK_GAP_PT,
    );
  });
});
