/**
 * Contrato de paridade da ESPESSURA DO TRAÇO ESTRUTURAL (achado 0150).
 *
 * O `0145` unificou a espessura da pauta da questão aberta, mas os outros três
 * traços do documento ficaram para trás: a régua do cabeçalho, a divisória e a
 * borda da caixa do andaime seguiam com `1` literal no `@react-pdf`, que é 1pt,
 * contra o `1px` CSS das telas, que é 0,75pt. Todo traço estrutural saía do
 * papel ~33% mais grosso do que na tela em que o professor conferiu a prova.
 *
 * `RULE_WIDTH_PX` é o ponto único, na família de `RULE_COLOR`: as telas o usam
 * em px e o PDF consome o mesmo valor convertido para pt pela razão 72/96. Quem
 * se move é o PDF, adotando os 0,75pt que as telas já mostravam.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { RULE_WIDTH_PX, RULE_WIDTH_PT, ANSWER_LINE_WIDTH_PX } from "./pageTokens";
import { DividerView } from "./blocks/DividerView";
import { ScaffoldingView } from "./blocks/ScaffoldingView";
import { DocumentHeaderView } from "./DocumentHeaderView";
import { PdfDivider, PdfScaffolding } from "./pdf/PdfLeafBlocks";
import { PdfHeader } from "./pdf/AdaptationPdf";

const DIVIDER: Extract<Block, { type: "divider" }> = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "divider",
};

const SCAFFOLDING: Extract<Block, { type: "scaffolding" }> = {
  id: "00000000-0000-4000-8000-000000000002",
  type: "scaffolding",
  items: ["Leia duas vezes"],
};

const HEADER = { title: "Prova de Ciencias", school: "", teacher: "", date: "" };

/** Estilo do nó raiz devolvido por um mapper do react-pdf. */
function rootStyle(node: ReactElement | null): Record<string, unknown> {
  return (node!.props as { style: Record<string, unknown> }).style;
}

describe("traço estrutural — paridade de espessura entre tela e PDF", () => {
  it("converte a espessura para pt pela mesma razão 72/96 usada no resto do PDF", () => {
    expect(RULE_WIDTH_PT).toBeCloseTo(RULE_WIDTH_PX * (72 / 96), 5);
  });

  it("mantém a pauta da questão aberta na mesma família de espessura", () => {
    expect(ANSWER_LINE_WIDTH_PX).toBe(RULE_WIDTH_PX);
  });

  it("desenha a régua do cabeçalho do PDF com RULE_WIDTH_PT", () => {
    expect(rootStyle(PdfHeader({ header: HEADER })).borderBottomWidth).toBe(RULE_WIDTH_PT);
  });

  it("desenha a divisória do PDF com RULE_WIDTH_PT", () => {
    expect(rootStyle(PdfDivider({ block: DIVIDER })).borderBottomWidth).toBe(RULE_WIDTH_PT);
  });

  it("desenha a borda da caixa do andaime do PDF com RULE_WIDTH_PT", () => {
    expect(rootStyle(PdfScaffolding({ block: SCAFFOLDING })).borderWidth).toBe(RULE_WIDTH_PT);
  });

  it("desenha a régua do cabeçalho da prévia do Exportar com RULE_WIDTH_PX", () => {
    render(<DocumentHeaderView header={HEADER} />);
    expect(screen.getByTestId("preview-header").style.borderBottomWidth).toBe(`${RULE_WIDTH_PX}px`);
  });

  it("desenha a divisória da prévia do Exportar com RULE_WIDTH_PX", () => {
    render(<DividerView block={DIVIDER} />);
    expect(screen.getByTestId("divider").style.borderTopWidth).toBe(`${RULE_WIDTH_PX}px`);
  });

  it("desenha a borda da caixa do andaime da prévia do Exportar com RULE_WIDTH_PX", () => {
    render(<ScaffoldingView block={SCAFFOLDING} />);
    expect(screen.getByTestId("scaffolding").style.borderWidth).toBe(`${RULE_WIDTH_PX}px`);
  });
});
