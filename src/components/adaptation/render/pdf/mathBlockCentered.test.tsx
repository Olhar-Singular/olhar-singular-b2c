/**
 * Paridade de posição da fórmula em BLOCO: tela x papel (achado 0432).
 *
 * As duas superfícies de conferência centram sempre o bloco (`BlockMathView`
 * com `text-center`, `BlockMathNodeView` com `block text-center`). No papel o
 * alinhamento tinha virado função do COMPRIMENTO do LaTeX: acima do teto de
 * átomo (achado 0427) o bloco saía encostado na margem esquerda, na mesma coluna
 * do corpo do texto, e dois blocos do mesmo documento podiam sair um centrado e
 * o outro não, sem nada na interface explicando a diferença.
 *
 * O contrato agora é de CAIXA: a caixa da fórmula é centrada na coluna
 * (`alignItems: "center"` no wrapper) e as linhas dentro dela alinham à
 * esquerda, para que as continuações continuem começando na mesma coluna — o
 * ganho do achado 0431 que não pode ser perdido. Quem garante que a caixa
 * realmente encolhe ao conteúdo (e portanto tem o que centrar) é
 * `mathBlockCenteredGeometry.test.tsx`, do achado 0433: aqui só a intenção do
 * estilo é afirmada, e sozinha ela acompanhou um PDF errado.
 */

import { describe, it, expect } from "vitest";
import { Children, type ReactElement, type ReactNode } from "react";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { PdfMath } from "./PdfMath";
import { MATH_PDF_MAX_ATOM_CHARS } from "./mathToPdfText";

const LONGA =
  "\\int_{0}^{1} \\frac{x^2 + 1}{\\sqrt{x^3 + 2x}}\\,dx = \\sum_{n=1}^{\\infty} \\frac{1}{n^2}";
const CURTA = "E=mc^2";

const render = (block: Extract<Block, { type: "blockMath" }>) => {
  const el = PdfMath({ block }) as ReactElement;
  const wrapper = el.props as { style: Record<string, unknown>; children: ReactElement };
  const lines = Children.toArray(
    (wrapper.children.props as { children: ReactNode }).children,
  ) as ReactElement[];
  return {
    wrapperStyle: wrapper.style,
    textStyle: lines[0].props.style as Record<string, unknown>,
  };
};

const mathBlock = (latex: string, style?: Extract<Block, { type: "blockMath" }>["style"]) =>
  ({ id: "m1", type: "blockMath", latex, style }) as Extract<Block, { type: "blockMath" }>;

describe("PdfMath — a caixa da fórmula é centrada como nas telas (achado 0432)", () => {
  it("centra a caixa da fórmula curta", () => {
    expect(CURTA.length).toBeLessThanOrEqual(MATH_PDF_MAX_ATOM_CHARS);
    expect(render(mathBlock(CURTA)).wrapperStyle.alignItems).toBe("center");
  });

  it("centra também a caixa da fórmula que quebra em mais de uma linha", () => {
    expect(LONGA.length).toBeGreaterThan(MATH_PDF_MAX_ATOM_CHARS);
    expect(render(mathBlock(LONGA)).wrapperStyle.alignItems).toBe("center");
  });

  it("não faz o alinhamento depender do comprimento do LaTeX", () => {
    const curta = render(mathBlock(CURTA));
    const longa = render(mathBlock(LONGA));
    expect(curta.wrapperStyle.alignItems).toBe(longa.wrapperStyle.alignItems);
    expect(curta.textStyle.textAlign).toBe(longa.textStyle.textAlign);
  });

  it("mantém as linhas de continuação na mesma coluna (achado 0431)", () => {
    expect(render(mathBlock(LONGA)).textStyle.textAlign).toBe("left");
  });

  it("alinha as linhas à esquerda mesmo com alinhamento explícito: quem move é a caixa", () => {
    expect(render(mathBlock(LONGA, { align: "right" })).textStyle.textAlign).toBe("left");
  });

  it("trata `justify` como esquerda: não há o que justificar numa caixa de fórmula", () => {
    expect(render(mathBlock(CURTA, { align: "justify" })).wrapperStyle.alignItems).toBe(
      "flex-start",
    );
  });

  it("centra a caixa quando o nó pede `center`, como o default", () => {
    expect(render(mathBlock(CURTA, { align: "center" })).wrapperStyle.alignItems).toBe("center");
  });

  it("respeita o alinhamento explícito do nó, como a tela faz pelo style inline", () => {
    expect(render(mathBlock(CURTA, { align: "right" })).wrapperStyle.alignItems).toBe("flex-end");
    expect(render(mathBlock(CURTA, { align: "left" })).wrapperStyle.alignItems).toBe("flex-start");
  });
});
