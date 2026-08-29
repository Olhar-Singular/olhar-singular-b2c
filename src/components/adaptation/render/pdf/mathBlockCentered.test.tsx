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
 * (`alignItems: "center"` no wrapper) e o texto dentro dela alinha à esquerda,
 * para que as linhas de continuação continuem começando na mesma coluna — o
 * ganho do achado 0431 que não pode ser perdido.
 */

import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { PdfMath } from "./PdfMath";
import { MATH_PDF_MAX_ATOM_CHARS } from "./mathToPdfText";

const LONGA =
  "\\int_{0}^{1} \\frac{x^2 + 1}{\\sqrt{x^3 + 2x}}\\,dx = \\sum_{n=1}^{\\infty} \\frac{1}{n^2}";
const CURTA = "E=mc^2";

const render = (block: Extract<Block, { type: "blockMath" }>) => {
  const el = PdfMath({ block }) as ReactElement;
  const wrapper = el.props as { style: Record<string, unknown>; children: ReactElement };
  const text = wrapper.children.props as { style: Record<string, unknown> };
  return { wrapperStyle: wrapper.style, textStyle: text.style };
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

  it("respeita o alinhamento explícito do nó, como a tela faz pelo style inline", () => {
    const { wrapperStyle, textStyle } = render(mathBlock(CURTA, { align: "right" }));
    expect(textStyle.textAlign).toBe("right");
    expect(wrapperStyle.alignItems).toBeUndefined();
  });
});
