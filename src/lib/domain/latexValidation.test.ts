import { describe, it, expect } from "vitest";
import { latexParseError } from "./latexValidation";

describe("latexParseError", () => {
  it("devolve null para LaTeX que o KaTeX parseia", () => {
    expect(latexParseError("x^2")).toBeNull();
    expect(latexParseError("\\frac{1}{n^2}")).toBeNull();
  });

  it("devolve a razão do KaTeX para chave que nunca fecha", () => {
    const error = latexParseError("\\frac{1{");
    expect(error).toBeTruthy();
    expect(error).toContain("}");
    // O prefixo "KaTeX parse error:" é ruído de biblioteca dentro de uma
    // mensagem que vai para a tela do professor.
    expect(error).not.toMatch(/KaTeX parse error/);
  });

  it("trata string vazia como sem erro — quem cuida do vazio é o rascunho", () => {
    expect(latexParseError("")).toBeNull();
  });
});
