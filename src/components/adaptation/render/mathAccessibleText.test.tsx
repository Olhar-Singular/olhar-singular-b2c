/**
 * Achado 0438: a folha era lida como sopa do KaTeX em vez do texto alternativo.
 *
 * `output: "htmlAndMathml"` emite DUAS árvores por fórmula e o KaTeX marca como
 * decorativa só a segunda (`.katex-html`). Sobra no texto do documento a leitura
 * do MathML MAIS o LaTeX cru da `<annotation>` — e nada disso é o `alt` que o
 * professor escreveu. O `aria-label` resolve o NOME do nó (fichas 0006/0403),
 * não o TEXTO que ele contribui para a folha em volta, que é por onde o leitor
 * de tela percorre o documento linha a linha.
 *
 * Por isso a asserção aqui é sobre o texto acessível (clonar, remover o que está
 * marcado `aria-hidden="true"`, olhar o que sobra): um teste que só olhasse o
 * `aria-label` passa com o defeito de pé.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { RichTextView } from "./RichTextView";
import { BlockMathView } from "./blocks/BlockMathView";
import type { Block, RichText } from "@/lib/adaptation/canonical/schema";

/** Texto que a tecnologia assistiva colhe do subtree, ignorando o decorativo. */
function accessibleText(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  return clone.textContent ?? "";
}

const LATEX = "\\int_0^1 x^2 \\, dx";
const ALT = "integral definida igual a soma infinita";

describe("texto acessível da fórmula na prévia (achado 0438)", () => {
  it("lê o alt da fórmula inline, e não a notação nem o LaTeX cru", () => {
    const content: RichText = [{ type: "inlineMath", latex: LATEX, alt: ALT }];
    const { container } = render(<RichTextView content={content} />);
    const texto = accessibleText(container);
    expect(texto).toContain(ALT);
    expect(texto).not.toContain("\\int");
    expect(texto).not.toContain("∫");
  });

  it("cai no LaTeX uma vez só quando a fórmula inline não tem alt", () => {
    const content: RichText = [{ type: "inlineMath", latex: LATEX }];
    const { container } = render(<RichTextView content={content} />);
    const texto = accessibleText(container);
    expect(texto.split(LATEX).length - 1).toBe(1);
    expect(texto).not.toContain("∫");
  });

  it("lê o alt da fórmula em bloco, e não a notação nem o LaTeX cru", () => {
    const block = { type: "blockMath", id: "b1", latex: LATEX, alt: ALT } as unknown as Extract<
      Block,
      { type: "blockMath" }
    >;
    const { container } = render(<BlockMathView block={block} />);
    const texto = accessibleText(container);
    expect(texto).toContain(ALT);
    expect(texto).not.toContain("\\int");
    expect(texto).not.toContain("∫");
  });

  it("cai no LaTeX uma vez só quando a fórmula em bloco não tem alt", () => {
    const block = { type: "blockMath", id: "b1", latex: LATEX } as unknown as Extract<
      Block,
      { type: "blockMath" }
    >;
    const { container } = render(<BlockMathView block={block} />);
    const texto = accessibleText(container);
    expect(texto.split(LATEX).length - 1).toBe(1);
    expect(texto).not.toContain("∫");
  });
});
