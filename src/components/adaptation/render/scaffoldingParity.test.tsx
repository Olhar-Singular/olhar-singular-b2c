/**
 * Contrato de paridade da CAIXA DO ANDAIME (achado 0124).
 *
 * O recuo dos passos era escrito à mão duas vezes: na prévia do Exportar,
 * `p-3` da caixa (12px) mais `pl-5` da `<ol>` (20px) = 32px; no PDF, `padding: 6`
 * (6pt = 8px) e nenhuma coluna de ordinal. O mesmo passo aparecia a 86px da
 * borda da folha na tela e a 63px no arquivo — 24px de desvio horizontal, o pior
 * do documento, e o único bloco em que a lista de apoio troca de coluna entre a
 * tela e o papel.
 *
 * Os tokens abaixo são o ponto único das duas superfícies impressas, na mesma
 * família de `ANSWER_ITEM_GAP_PX` (achado 0313). O valor adotado é o que a tela
 * já mostrava: quem se move é o PDF.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import type { Block } from "@/lib/adaptation/canonical/schema";
import {
  SCAFFOLDING_PADDING_PX,
  SCAFFOLDING_PADDING_PT,
  SCAFFOLDING_MARGIN_Y_PX,
  SCAFFOLDING_MARGIN_Y_PT,
  SCAFFOLDING_STEP_INDENT_PX,
  SCAFFOLDING_STEP_INDENT_PT,
} from "./pageTokens";
import { ScaffoldingView } from "./blocks/ScaffoldingView";
import { PdfScaffolding } from "./pdf/PdfLeafBlocks";

const BLOCK: Extract<Block, { type: "scaffolding" }> = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "scaffolding",
  items: ["Leia duas vezes", "Grife as palavras-chave"],
};

/** Estilo da caixa devolvida por PdfScaffolding. */
function boxStyle(node: ReactElement): Record<string, unknown> {
  return (node.props as { style: Record<string, unknown> }).style;
}

/** Estilo da coluna de ordinal do primeiro passo na árvore react-pdf. */
function firstMarkerStyle(node: ReactElement): { width?: number } {
  const rows = (node.props as { children: ReactElement[] }).children;
  const cells = (rows[0].props as { children: ReactElement[] }).children;
  return (cells[0].props as { style: { width?: number } }).style;
}

describe("andaime — paridade da caixa entre a prévia e o PDF", () => {
  it("converte os tokens para pt pela mesma razão 72/96 usada no resto do PDF", () => {
    expect(SCAFFOLDING_PADDING_PT).toBeCloseTo(SCAFFOLDING_PADDING_PX * (72 / 96), 5);
    expect(SCAFFOLDING_MARGIN_Y_PT).toBeCloseTo(SCAFFOLDING_MARGIN_Y_PX * (72 / 96), 5);
    expect(SCAFFOLDING_STEP_INDENT_PT).toBeCloseTo(SCAFFOLDING_STEP_INDENT_PX * (72 / 96), 5);
  });

  it("usa os tokens na caixa e no recuo dos passos da prévia do Exportar", () => {
    render(<ScaffoldingView block={BLOCK} />);
    const box = screen.getByTestId("scaffolding");
    expect(box.style.padding).toBe(`${SCAFFOLDING_PADDING_PX}px`);
    expect(box.style.marginTop).toBe(`${SCAFFOLDING_MARGIN_Y_PX}px`);
    expect(box.style.marginBottom).toBe(`${SCAFFOLDING_MARGIN_Y_PX}px`);
    const list = box.querySelector("ol") as HTMLElement;
    expect(list.style.paddingLeft).toBe(`${SCAFFOLDING_STEP_INDENT_PX}px`);
  });

  it("usa o equivalente em pt dos mesmos tokens na caixa do PDF", () => {
    const style = boxStyle(PdfScaffolding({ block: BLOCK }) as ReactElement);
    expect(style.padding).toBe(SCAFFOLDING_PADDING_PT);
    expect(style.marginVertical).toBe(SCAFFOLDING_MARGIN_Y_PT);
  });

  it("recua o texto do passo no PDF por uma coluna de ordinal do mesmo tamanho", () => {
    const marker = firstMarkerStyle(PdfScaffolding({ block: BLOCK }) as ReactElement);
    expect(marker.width).toBe(SCAFFOLDING_STEP_INDENT_PT);
  });
});
