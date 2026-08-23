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

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import type { NodeViewProps } from "@tiptap/react";
import type { Block } from "@/lib/adaptation/canonical/schema";
import {
  SCAFFOLDING_PADDING_PX,
  SCAFFOLDING_PADDING_PT,
  SCAFFOLDING_MARGIN_Y_PX,
  SCAFFOLDING_MARGIN_Y_PT,
  SCAFFOLDING_STEP_INDENT_PX,
  SCAFFOLDING_STEP_INDENT_PT,
  SCAFFOLDING_BG,
  SCAFFOLDING_BORDER,
  SCAFFOLDING_LABEL,
} from "./pageTokens";
import { ScaffoldingView } from "./blocks/ScaffoldingView";
import { ScaffoldNodeView } from "../canonical-editor/nodeviews/ScaffoldNodeView";
import { PdfScaffolding } from "./pdf/PdfLeafBlocks";
import { resolveElementFontSizes, resolvePageStyle } from "./pageStyle";

vi.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...rest }: { children: ReactNode }) => <div {...rest}>{children}</div>,
}));

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
/** Props mínimas do NodeView do andaime no editor. */
function nodeViewProps(items: string[]): NodeViewProps {
  return {
    node: { attrs: { items } },
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    editor: { isEditable: true },
  } as unknown as NodeViewProps;
}

function firstMarkerStyle(node: ReactElement): { width?: number } {
  // children = [rótulo da caixa, linhas dos passos] desde o achado 0155.
  const [, rows] = (node.props as { children: [ReactElement, ReactElement[]] }).children;
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

describe("andaime — paridade da COR da caixa entre as três superfícies (achado 0149)", () => {
  it("expõe a cor da folha já composta sobre o papel branco, sem alpha", () => {
    expect(SCAFFOLDING_BG).toBe("#F5F3F0");
    expect(SCAFFOLDING_BORDER).toBe("#E4DFD7");
  });

  it("pinta a caixa do PDF com os mesmos tokens, não com os cinzas do Tailwind", () => {
    const style = boxStyle(PdfScaffolding({ block: BLOCK }) as ReactElement);
    expect(style.backgroundColor).toBe(SCAFFOLDING_BG);
    expect(style.borderColor).toBe(SCAFFOLDING_BORDER);
  });

  it("pinta a caixa da prévia do Exportar com os mesmos tokens", () => {
    render(<ScaffoldingView block={BLOCK} />);
    const box = screen.getByTestId("scaffolding");
    expect(box.style.backgroundColor).toBe("rgb(245, 243, 240)");
    expect(box.style.borderColor).toBe("rgb(228, 223, 215)");
  });

  it("pinta a caixa do editor com os mesmos tokens", () => {
    render(<ScaffoldNodeView {...nodeViewProps(["Leia duas vezes"])} />);
    const box = screen.getByTestId("scaffold-node");
    expect(box.style.backgroundColor).toBe("rgb(245, 243, 240)");
    expect(box.style.borderColor).toBe("rgb(228, 223, 215)");
  });
});

/**
 * Contrato do RÓTULO da caixa do andaime (achado 0155).
 *
 * O rótulo "APOIO" existia uma vez só, como chrome do editor. A prévia do
 * Exportar e o PDF desenhavam a lista de passos direto, então o aluno recebia um
 * retângulo bege sem título — e a caixa do andaime, ao contrário de um título ou
 * de uma legenda, não se identifica sozinha no papel: o rótulo é a ÚNICA coisa
 * que a nomeia. Agora ele é texto do documento, vindo de um token único, com a
 * tipografia da folha (`--doc-fs-caption` na tela, `elementSizes.caption` no PDF)
 * em vez de um `text-xs` fixo do chrome.
 */
describe("andaime — rótulo da caixa nas três superfícies (achado 0155)", () => {
  it("imprime o rótulo na prévia do Exportar, com o tamanho de legenda da folha", () => {
    render(<ScaffoldingView block={BLOCK} />);
    const label = screen.getByTestId("scaffolding-label");
    expect(label).toHaveTextContent(SCAFFOLDING_LABEL);
    expect(label.style.fontSize).toContain("--doc-fs-caption");
  });

  it("imprime o mesmo rótulo no PDF, no tamanho de legenda resolvido", () => {
    const node = PdfScaffolding({ block: BLOCK }) as ReactElement;
    const label = (node.props as { children: [ReactElement, ReactElement[]] }).children[0];
    expect((label.props as { children: string }).children).toBe(SCAFFOLDING_LABEL);
    expect((label.props as { style: { fontSize: number } }).style.fontSize).toBe(
      resolveElementFontSizes(resolvePageStyle()).caption,
    );
  });

  it("usa o mesmo token de rótulo no editor, e não um literal solto", () => {
    render(<ScaffoldNodeView {...nodeViewProps(["Leia duas vezes"])} />);
    expect(screen.getByTestId("scaffold-label")).toHaveTextContent(SCAFFOLDING_LABEL);
  });
});
