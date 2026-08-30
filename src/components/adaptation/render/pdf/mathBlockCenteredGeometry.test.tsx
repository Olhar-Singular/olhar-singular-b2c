/**
 * Onde a tinta da fórmula em bloco cai no papel (achado 0433).
 *
 * O achado 0432 centrou a CAIXA da fórmula (`alignItems: "center"` no wrapper)
 * e o teste daquela ronda afirmava só a intenção do estilo. No papel real a
 * fórmula longa continuava em x = 40,00 pt nas duas linhas — a margem — porque
 * uma caixa que satura a coluna não tem o que centrar: o Yoga clampa a largura
 * do `<Text>` na coluna útil, o textkit quebra dentro dela e as linhas nascem
 * na borda esquerda, a mesma coluna do corpo do texto.
 *
 * Este arquivo mede a GEOMETRIA que o elemento produz, não o objeto de estilo:
 * a fórmula sai em Courier (monoespaçada), então a largura de cada linha é uma
 * conta fechada, e daí sai o x em que a caixa centrada começa. O contrato é o
 * das telas: o bloco fica no meio da coluna, curto ou longo, e as linhas de
 * continuação começam todas na mesma coluna (achado 0431).
 */

import { describe, it, expect } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { Children, isValidElement } from "react";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { PdfMath } from "./PdfMath";
import { MATH_PDF_MAX_ATOM_CHARS } from "./mathToPdfText";
import { MATH_PDF_FONT_SIZE_PT, PAGE_MARGIN_PT } from "../pageTokens";

const LONGA =
  "\\int_{0}^{1} \\frac{x^2 + 1}{\\sqrt{x^3 + 2x}}\\,dx = \\sum_{n=1}^{\\infty} \\frac{1}{n^2}";
const CURTA = "E=mc^2";

/** Coluna útil da folha A4 do `@react-pdf`, em pt. */
const COLUMN_PT = 595.28 - 2 * PAGE_MARGIN_PT;
/** Avanço de um caractere da Courier, em pt. */
const ADVANCE_PT = 0.6 * MATH_PDF_FONT_SIZE_PT;

const mathBlock = (latex: string) =>
  ({ id: "m1", type: "blockMath", latex }) as Extract<Block, { type: "blockMath" }>;

/** Todo texto impresso pelo elemento, uma entrada por `<Text>`. */
function textLines(node: ReactNode): string[] {
  const out: string[] = [];
  const walk = (n: ReactNode) => {
    if (typeof n === "string") {
      out.push(n);
      return;
    }
    if (!isValidElement(n)) return;
    Children.forEach((n.props as { children?: ReactNode }).children, walk);
  };
  walk(node);
  return out;
}

/**
 * Onde a tinta do bloco começa, em pt da borda da folha.
 *
 * A caixa da fórmula só encolhe ao conteúdo enquanto o conteúdo cabe; passando
 * disso ela satura a coluna e o `alignItems: "center"` vira no-op. É essa
 * saturação que o achado 0433 mede.
 */
function inkStartX(latex: string): number {
  const lines = textLines(PdfMath({ block: mathBlock(latex) }) as ReactElement);
  const widest = Math.max(...lines.map((l) => l.length * ADVANCE_PT));
  const boxWidth = Math.min(widest, COLUMN_PT);
  return PAGE_MARGIN_PT + (COLUMN_PT - boxWidth) / 2;
}

describe("PdfMath — a tinta do bloco cai no meio da coluna (achado 0433)", () => {
  it("centra a fórmula que cabe numa linha", () => {
    expect(CURTA.length).toBeLessThanOrEqual(MATH_PDF_MAX_ATOM_CHARS);
    expect(inkStartX(CURTA)).toBeGreaterThan(PAGE_MARGIN_PT);
  });

  it("centra também a fórmula que precisa de mais de uma linha", () => {
    expect(LONGA.length).toBeGreaterThan(MATH_PDF_MAX_ATOM_CHARS);
    expect(inkStartX(LONGA)).toBeGreaterThan(PAGE_MARGIN_PT);
  });

  it("nunca emite uma linha mais larga que a coluna, que saturaria a caixa", () => {
    const lines = textLines(PdfMath({ block: mathBlock(LONGA) }) as ReactElement);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length * ADVANCE_PT).toBeLessThanOrEqual(COLUMN_PT);
  });

  it("não perde nem inventa caractere ao quebrar a fórmula", () => {
    const lines = textLines(PdfMath({ block: mathBlock(LONGA) }) as ReactElement);
    const impresso = lines.join(" ").replace(/\s+/g, " ");
    expect(impresso).toBe(LONGA.replace(/\s+/g, " "));
  });
});
