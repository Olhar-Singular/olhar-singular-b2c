/**
 * Avanço de linha do run de fórmula INLINE (achado 0430).
 *
 * A `0424` deu à fórmula do PDF a mesma tinta relativa da tela, e para isso
 * precisou de uma caixa em bem maior (Courier tem caixa alta 0,572 contra 0,718
 * da Helvetica): 16,87 pt num corpo de 12 pt. A `0429` fez todo corpo próprio
 * declarar a razão de entrelinha ao lado do próprio corpo. Somadas, as duas
 * fizeram o run inline pedir 16,87 x 1,4 = 23,62 pt de avanço, e o textkit
 * dimensiona a linha pelo run mais alto: o parágrafo INTEIRO passou a avançar
 * 23,62 pt no papel contra 17,89 pt na folha do Revisar (+32%).
 *
 * Na tela isso não acontece porque o `.katex` é `inline-block` com o
 * line-height do PARÁGRAFO: a caixa da fórmula estica a linha só pelo tanto que
 * ela própria mede. A compensação de caixa alta existe para a TINTA; vazar para
 * a ENTRELINHA pagina a prova errado.
 *
 * Contrato: o produto `fontSize x lineHeight` do run inline de fórmula é o
 * avanço do corpo do documento. A fórmula em BLOCO fica de fora — lá a linha é
 * da própria fórmula e a razão cheia é o certo (`0429`).
 */

import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { PdfRichText } from "./PdfRichText";
import { PdfMath } from "./PdfMath";
import { BASE_FONT_PT, BASE_LINE_HEIGHT, MATH_PDF_FONT_SIZE_PT } from "../pageTokens";
import type { RichText } from "@/lib/adaptation/canonical/schema";

type Styleish = { fontSize?: number; lineHeight?: number };

/** Estilos com corpo próprio na árvore, renderizando componentes de função. */
function sizedStyles(node: unknown, out: Styleish[] = []): Styleish[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((child) => sizedStyles(child, out));
    return out;
  }
  if (!isValidElement(node)) return out;
  const el = node as ReactElement;
  const style = (el.props as { style?: Styleish }).style;
  if (style && typeof style.fontSize === "number") out.push(style);
  if (typeof el.type === "function") {
    sizedStyles((el.type as (p: unknown) => unknown)(el.props), out);
  }
  sizedStyles((el.props as { children?: unknown }).children, out);
  return out;
}

const inlineContent: RichText = [
  { type: "text", text: "Considere a equação " },
  { type: "inlineMath", latex: "x^2 + 2x + 1 = 0", alt: "x ao quadrado" },
  { type: "text", text: " e observe." },
];

describe("avanço da linha com fórmula inline (achado 0430)", () => {
  it("dá ao run inline de fórmula o avanço do corpo, não o do próprio tamanho", () => {
    const [style] = sizedStyles(PdfRichText({ content: inlineContent }));

    expect(style.fontSize).toBe(MATH_PDF_FONT_SIZE_PT);
    expect((style.fontSize as number) * (style.lineHeight as number)).toBeCloseTo(
      BASE_FONT_PT * BASE_LINE_HEIGHT,
      5,
    );
  });

  it("mantém a razão cheia na fórmula em bloco, onde a linha é da própria fórmula", () => {
    const [style] = sizedStyles(
      PdfMath({ block: { type: "blockMath", id: "m1", latex: "x^2 = 1" } }),
    );

    expect(style.lineHeight).toBe(BASE_LINE_HEIGHT);
  });
});
