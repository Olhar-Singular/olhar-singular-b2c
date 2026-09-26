/**
 * A descrição legível da fórmula é TEXTO DO DOCUMENTO (achado 0191).
 *
 * Desde o 0401 o papel imprime o `alt` do nó quando ele existe — prosa em
 * português —, mas o run continuava vestido com a tipografia que existe para o
 * LaTeX: `Courier` e o corpo compensado de `mathPdfFontSizePt`. A mesma linha
 * trocava de fonte no meio de si mesma e a parte vinda do `alt` saía maior que
 * o parágrafo que a cerca, com o avanço monoespaçado abrindo buracos entre as
 * palavras.
 *
 * Contrato: a tipografia de fórmula vale só para o caminho do LaTeX cru, que é
 * o do nó SEM `alt`.
 */

import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { Block, RichText } from "@/lib/adaptation/canonical/schema";
import { PdfMath } from "./PdfMath";
import { PdfRichText } from "./PdfRichText";
import { BASE_FONT_PT, mathPdfFontSizePt } from "../pageTokens";

type TextStyle = { fontFamily?: string; fontSize?: number };

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
  if (typeof el.type === "function") {
    textStyles((el.type as (p: unknown) => ReactNode)(el.props), out);
  }
  textStyles(el.props.children, out);
  return out;
}

const blockMath = (extra: { latex: string; alt?: string }) =>
  ({ id: "m1", type: "blockMath", ...extra }) as Extract<Block, { type: "blockMath" }>;

const ALT = "E igual a m c ao quadrado";

describe("tipografia do `alt` da fórmula no PDF (achado 0191)", () => {
  it("bloco com alt não sai em Courier nem num corpo maior que o do documento", () => {
    const styles = textStyles(PdfMath({ block: blockMath({ latex: "E=mc^2", alt: ALT }) }));

    expect(styles.some((s) => s.fontFamily === "Courier")).toBe(false);
    for (const style of styles) {
      if (style.fontSize !== undefined) expect(style.fontSize).toBe(BASE_FONT_PT);
    }
  });

  it("bloco com alt acompanha o corpo do CONTEXTO, como o parágrafo ao redor", () => {
    const styles = textStyles(
      PdfMath({ block: blockMath({ latex: "E=mc^2", alt: ALT }), fontSize: 21 }),
    );
    const sizes = styles.map((s) => s.fontSize).filter((s): s is number => s !== undefined);

    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toBe(21);
  });

  it("bloco SEM alt mantém a tipografia da fórmula", () => {
    const styles = textStyles(PdfMath({ block: blockMath({ latex: "E=mc^2" }) }));

    expect(styles.some((s) => s.fontFamily === "Courier")).toBe(true);
    expect(styles.some((s) => s.fontSize === mathPdfFontSizePt(BASE_FONT_PT))).toBe(true);
  });

  it("inline com alt herda a tipografia do parágrafo que o hospeda", () => {
    const content: RichText = [
      { type: "text", text: "A formula usada e " },
      { type: "inlineMath", latex: "E=mc^2", alt: ALT },
    ];
    const styles = textStyles(PdfRichText({ content }));

    expect(styles.some((s) => s.fontFamily === "Courier")).toBe(false);
    for (const style of styles) expect(style.fontSize).toBeUndefined();
  });

  it("inline SEM alt mantém a tipografia da fórmula", () => {
    const content: RichText = [{ type: "inlineMath", latex: "E=mc^2" }];

    expect(textStyles(PdfRichText({ content })).some((s) => s.fontFamily === "Courier")).toBe(true);
  });
});
