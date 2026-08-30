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
 * por linha. Quem centra o bloco na coluna é a caixa que agrupa as linhas
 * (achados 0432 e 0433, cobertos em `mathBlockCentered.test.tsx` e em
 * `mathBlockCenteredGeometry.test.tsx`).
 */

import { describe, it, expect } from "vitest";
import { Children, type ReactElement, type ReactNode } from "react";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { PdfMath } from "./PdfMath";
import { MATH_PDF_MAX_ATOM_CHARS } from "./mathToPdfText";

const LONGA =
  "\\int_{0}^{1} \\frac{x^2 + 1}{\\sqrt{x^3 + 2x}}\\,dx = \\sum_{n=1}^{\\infty} \\frac{1}{n^2}";
const CURTA = "E=mc^2";

/** O alinhamento das linhas da fórmula dentro da caixa que as agrupa. */
const alignOf = (latex: string) => {
  const block = { id: "m1", type: "blockMath", latex } as Extract<Block, { type: "blockMath" }>;
  const el = PdfMath({ block }) as ReactElement;
  const box = (el.props as { children: ReactElement }).children;
  const lines = Children.toArray((box.props as { children: ReactNode }).children) as ReactElement[];
  const aligns = new Set(lines.map((l) => (l.props.style as { textAlign?: string }).textAlign));
  expect(aligns.size).toBe(1);
  return [...aligns][0];
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
