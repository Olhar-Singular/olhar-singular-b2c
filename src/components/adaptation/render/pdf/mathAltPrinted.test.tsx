/**
 * O `alt` do nó de math chega ao papel (achado 0401).
 *
 * As views de tela já imprimem `alt ?? latex` (`RichTextView`, `BlockMathView`).
 * O PDF descartava o `alt` na própria assinatura do mapper e entregava LaTeX cru
 * ao aluno, numa folha cuja razão de existir é remover barreira de leitura.
 */

import { describe, it, expect } from "vitest";
import { Children, type ReactElement, type ReactNode } from "react";
import type { Block, RichText } from "@/lib/adaptation/canonical/schema";
import { PdfMath } from "./PdfMath";
import { PdfRichText } from "./PdfRichText";

/** Todo o texto que um elemento do react-pdf produz. */
function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  const el = node as ReactElement<{ children?: ReactNode }> | null;
  if (!el || typeof el !== "object" || !("props" in el)) return "";
  return Children.toArray(el.props.children).map(textOf).join("");
}

describe("PDF imprime a descrição legível da fórmula", () => {
  it("inline: usa o alt do run", () => {
    const content: RichText = [
      { type: "text", text: "considere " },
      { type: "inlineMath", latex: "x^2 + 2x + 1 = 0", alt: "x ao quadrado mais 2x mais 1 igual a zero" },
    ];
    const out = textOf(PdfRichText({ content }) as ReactElement);
    expect(out).toContain("x ao quadrado mais 2x mais 1 igual a zero");
    expect(out).not.toContain("^");
  });

  it("bloco: usa o alt do bloco", () => {
    const block = {
      id: "m1",
      type: "blockMath",
      latex: "\\frac{1}{n^2}",
      alt: "um sobre n ao quadrado",
    } as Extract<Block, { type: "blockMath" }>;
    const out = textOf(PdfMath({ block }) as ReactElement);
    expect(out).toBe("um sobre n ao quadrado");
  });

  it("bloco sem alt continua imprimindo o LaTeX", () => {
    const block = { id: "m2", type: "blockMath", latex: "E=mc^2" } as Extract<
      Block,
      { type: "blockMath" }
    >;
    expect(textOf(PdfMath({ block }) as ReactElement)).toBe("E=mc^2");
  });
});
