/**
 * Alinhamento da fórmula em BLOCO no PDF (achado 0431).
 *
 * `textAlign: "center"` num `<Text>` de várias linhas centra CADA linha, não o
 * parágrafo. Enquanto a fórmula cabia numa linha só, centrar a linha e centrar o
 * bloco eram a mesma coisa; a partir do teto de largura (achado 0427) a fórmula
 * longa quebra e as duas metades saíam em recuos diferentes no papel, cada uma
 * centrada por si (x 44,58 e x 130,62), sem pista de que são a mesma fórmula.
 *
 * A garantia deste arquivo é a das metades: o texto do bloco nunca é centrado
 * por linha. Quem centra o bloco na coluna é a caixa (achado 0432, coberto em
 * `mathBlockCentered.test.tsx`).
 */

import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { PdfMath } from "./PdfMath";
import { MATH_PDF_MAX_ATOM_CHARS } from "./mathToPdfText";

const LONGA =
  "\\int_{0}^{1} \\frac{x^2 + 1}{\\sqrt{x^3 + 2x}}\\,dx = \\sum_{n=1}^{\\infty} \\frac{1}{n^2}";
const CURTA = "E=mc^2";

const alignOf = (latex: string) => {
  const block = { id: "m1", type: "blockMath", latex } as Extract<Block, { type: "blockMath" }>;
  const el = PdfMath({ block }) as ReactElement;
  const innerText = (el.props as { children: ReactElement }).children;
  return (innerText.props.style as { textAlign?: string }).textAlign;
};

describe("PdfMath — a fórmula quebrada lê como um objeto só", () => {
  it("não centra por linha a fórmula que cabe numa linha só", () => {
    expect(CURTA.length).toBeLessThanOrEqual(MATH_PDF_MAX_ATOM_CHARS);
    expect(alignOf(CURTA)).toBe("left");
  });

  it("não centra cada metade da fórmula longa: as linhas começam na mesma coluna", () => {
    expect(LONGA.length).toBeGreaterThan(MATH_PDF_MAX_ATOM_CHARS);
    expect(alignOf(LONGA)).toBe("left");
  });
});
