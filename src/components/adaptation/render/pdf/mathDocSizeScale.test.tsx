/**
 * A fórmula impressa acompanha o TAMANHO DO DOCUMENTO (achado 0402).
 *
 * A razão de tinta da `0424` foi assinada num corpo de 12 pt e virou constante:
 * subir o texto no popover "Formato" escalava a folha do Revisar (o KaTeX é
 * dimensionado em `em`) e deixava a fórmula do papel parada. Num documento de
 * 21 pt, pedido por quem tem baixa visão, a mesma frase saía com o corpo grande
 * e a matemática no tamanho de 12 pt.
 *
 * Contrato: a fórmula guarda com o corpo do CONTEXTO onde está a mesma razão
 * que guarda no tamanho base, em qualquer tamanho de documento.
 */

import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { AdaptationPdf } from "./AdaptationPdf";
import { BASE_FONT_PT, MATH_PDF_FONT_SIZE_PT } from "../pageTokens";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Corpos declarados por runs da família da fórmula, em toda a árvore. */
function mathFontSizes(node: unknown, out: number[] = []): number[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((child) => mathFontSizes(child, out));
    return out;
  }
  if (!isValidElement(node)) return out;
  const el = node as ReactElement;
  const style = (el.props as { style?: { fontFamily?: string; fontSize?: number } }).style;
  if (style?.fontFamily === "Courier" && typeof style.fontSize === "number") {
    out.push(style.fontSize);
  }
  if (typeof el.type === "function") {
    mathFontSizes((el.type as (p: unknown) => unknown)(el.props), out);
  }
  mathFontSizes((el.props as { children?: unknown }).children, out);
  return out;
}

const doc: CanonicalDocument = {
  version: 1,
  blocks: [
    {
      type: "paragraph",
      id: id(1),
      content: [
        { type: "text", text: "Considere " },
        { type: "inlineMath", latex: "x^2+2x+1=0" },
        { type: "text", text: " e resolva." },
      ],
    },
    { type: "blockMath", id: id(2), latex: "x = 1" },
  ],
};

describe("corpo da fórmula no PDF x tamanho do documento (achado 0402)", () => {
  const RATIO = MATH_PDF_FONT_SIZE_PT / BASE_FONT_PT;

  it("mantém a razão de tinta num documento com corpo maior", () => {
    const sizes = mathFontSizes(AdaptationPdf({ document: doc, pageStyle: { fontSize: 21 } }));

    expect(sizes.length).toBe(2);
    for (const size of sizes) expect(size / 21).toBeCloseTo(RATIO, 5);
  });

  it("não move nada no tamanho base", () => {
    const sizes = mathFontSizes(AdaptationPdf({ document: doc }));

    expect(sizes.length).toBe(2);
    for (const size of sizes) expect(size).toBeCloseTo(MATH_PDF_FONT_SIZE_PT, 5);
  });
});
