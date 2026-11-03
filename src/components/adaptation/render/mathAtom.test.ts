import { describe, it, expect } from "vitest";
import { latexLayoutAtom, MATH_NBSP } from "./mathAtom";

describe("latexLayoutAtom", () => {
  it("troca os espaços do LaTeX por espaço inquebrável", () => {
    expect(latexLayoutAtom("(x+1)^2 = 0")).toBe(`(x+1)^2${MATH_NBSP}=${MATH_NBSP}0`);
  });

  it("cobre qualquer espaço em branco, um a um", () => {
    expect(latexLayoutAtom("a \t\nb")).toBe(`a${MATH_NBSP}${MATH_NBSP}${MATH_NBSP}b`);
  });

  it("devolve intacto o LaTeX que já não tem espaço", () => {
    expect(latexLayoutAtom("\\frac{a}{b}")).toBe("\\frac{a}{b}");
  });
});

describe("latexLayoutAtom com teto de largura (achado 0427)", () => {
  const BLOCO =
    "\\int_{0}^{1} \\frac{x^2 + 1}{\\sqrt{x^3 + 2x}}\\,dx = \\sum_{n=1}^{\\infty} \\frac{1}{n^2}";

  it("devolve o LaTeX quebrável quando o átomo não cabe na coluna", () => {
    expect(BLOCO.length).toBeGreaterThan(50);
    const out = latexLayoutAtom(BLOCO, 50);
    expect(out).toBe(BLOCO);
    expect(out).not.toContain(MATH_NBSP);
  });

  it("ainda costura o átomo quando ele cabe no teto", () => {
    expect(latexLayoutAtom("(x+1)^2 = 0", 50)).toBe(`(x+1)^2${MATH_NBSP}=${MATH_NBSP}0`);
  });

  it("costura a fórmula do tamanho exato do teto", () => {
    const latex = "a ".repeat(25).trim(); // 49 caracteres
    expect(latexLayoutAtom(latex, 49)).not.toContain(" ");
  });
});
