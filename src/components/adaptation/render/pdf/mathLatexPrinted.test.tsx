/**
 * A folha do aluno nunca troca a fórmula pelo `alt` (achado 0803).
 *
 * O `alt` é o texto alternativo da fórmula (rótulo do campo no editor), um nome
 * acessível curto como "teorema de pitagoras", não uma leitura da equação. O
 * 0401 passou a imprimi-lo no lugar do LaTeX, e a prova chegava ao aluno com o
 * nome do teorema onde devia estar a conta. O conteúdo impresso vem do `latex`,
 * como no "Copiar" (achado 0125), e com a tipografia de fórmula (0424).
 */

import { describe, it, expect } from "vitest";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
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

type TextStyle = { fontFamily?: string | string[] };

/** O estilo de todo elemento da árvore, já expandidos os componentes. */
function textStyles(node: ReactNode, out: TextStyle[] = []): TextStyle[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((child) => textStyles(child, out));
    return out;
  }
  if (!isValidElement(node)) return out;
  const el = node as ReactElement<{ style?: TextStyle; children?: ReactNode }>;
  if (el.props.style) out.push(el.props.style);
  textStyles(el.props.children, out);
  return out;
}

const blockMath = (extra: { latex: string; alt?: string }) =>
  ({ id: "m1", type: "blockMath", ...extra }) as Extract<Block, { type: "blockMath" }>;

describe("PDF imprime a fórmula, nunca o texto alternativo (achado 0803)", () => {
  it("bloco com alt imprime o LaTeX, em Courier", () => {
    const el = PdfMath({
      block: blockMath({ latex: "a^2 + b^2 = c^2", alt: "teorema de pitagoras" }),
    }) as ReactElement;
    expect(textOf(el)).toBe("a^2 + b^2 = c^2");
    expect(textOf(el)).not.toContain("pitagoras");
    expect(textStyles(el).some((s) => [s.fontFamily].flat()[0] === "Courier")).toBe(true);
  });

  it("inline com alt imprime o LaTeX, em Courier", () => {
    const content: RichText = [
      { type: "text", text: "A formula usada e " },
      { type: "inlineMath", latex: "E = mc^2", alt: "E igual a m c ao quadrado" },
    ];
    const el = PdfRichText({ content }) as ReactElement;
    // a marca de "não hifenize" (U+00AD) não imprime nada
    expect(textOf(el).replace(/\u00ad/g, "")).toContain("E = mc^2");
    expect(textOf(el)).not.toContain("ao quadrado");
    expect(textStyles(el).some((s) => [s.fontFamily].flat()[0] === "Courier")).toBe(true);
  });

  it("bloco sem alt continua imprimindo o LaTeX", () => {
    expect(textOf(PdfMath({ block: blockMath({ latex: "E=mc^2" }) }) as ReactElement)).toBe(
      "E=mc^2",
    );
  });
});
