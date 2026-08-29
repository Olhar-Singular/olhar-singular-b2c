/**
 * Alinhamento da fórmula em BLOCO no PDF (achado 0431).
 *
 * `textAlign: "center"` num `<Text>` de várias linhas centra CADA linha, não o
 * parágrafo. Enquanto a fórmula cabia numa linha só, centrar a linha e centrar o
 * bloco eram a mesma coisa; a partir do teto de largura (achado 0427) a fórmula
 * longa quebra e as duas metades saem em recuos diferentes no papel, cada uma
 * centrada por si (x 44,58 e x 130,62), sem pista de que são a mesma fórmula.
 */

import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { PdfMath } from "./PdfMath";
import { mathBlockTextAlign, MATH_PDF_MAX_ATOM_CHARS } from "./mathToPdfText";

const LONGA =
  "\\int_{0}^{1} \\frac{x^2 + 1}{\\sqrt{x^3 + 2x}}\\,dx = \\sum_{n=1}^{\\infty} \\frac{1}{n^2}";
const CURTA = "E=mc^2";

const alignOf = (latex: string) => {
  const block = { id: "m1", type: "blockMath", latex } as Extract<Block, { type: "blockMath" }>;
  const el = PdfMath({ block }) as ReactElement;
  const innerText = (el.props as { children: ReactElement }).children;
  return (innerText.props.style as { textAlign?: string }).textAlign;
};

describe("mathBlockTextAlign (achado 0431)", () => {
  it("centra a fórmula que cabe numa linha só", () => {
    expect(CURTA.length).toBeLessThanOrEqual(MATH_PDF_MAX_ATOM_CHARS);
    expect(mathBlockTextAlign(CURTA)).toBe("center");
  });

  it("alinha à esquerda a fórmula que não cabe na coluna e vai quebrar", () => {
    expect(LONGA.length).toBeGreaterThan(MATH_PDF_MAX_ATOM_CHARS);
    expect(mathBlockTextAlign(LONGA)).toBe("left");
  });
});

describe("PdfMath — a fórmula quebrada lê como um objeto só", () => {
  it("mantém a fórmula curta centrada (caso comum não muda)", () => {
    expect(alignOf(CURTA)).toBe("center");
  });

  it("não centra cada metade da fórmula longa: as linhas começam na mesma coluna", () => {
    expect(alignOf(LONGA)).toBe("left");
  });
});
