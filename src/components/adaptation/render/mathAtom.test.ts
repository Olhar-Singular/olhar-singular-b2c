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
