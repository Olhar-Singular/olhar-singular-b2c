import { describe, it, expect } from "vitest";
import {
  mathToPdfText,
  mathBlockLines,
  MATH_PDF_STYLE,
  MATH_PDF_MAX_ATOM_CHARS,
} from "./mathToPdfText";

describe("mathToPdfText", () => {
  it("returns the LaTeX source verbatim (v1 projection)", () => {
    expect(mathToPdfText("\\frac{a}{b}")).toBe("\\frac{a}{b}");
  });

  it("costura os espaços do LaTeX como inquebráveis (achado 0425)", () => {
    const out = mathToPdfText("(x+1)^2 = 0");
    expect(out).toBe("(x+1)^2\u00a0=\u00a00");
    expect(out).not.toContain(" ");
  });

  it("preserva cada espaço, mesmo repetido ou de tabulação", () => {
    expect(mathToPdfText("a \t b")).toBe("a\u00a0\u00a0\u00a0b");
  });

  it("exposes a monospace style for math runs", () => {
    expect(MATH_PDF_STYLE.fontFamily).toBe("Courier");
    expect(MATH_PDF_STYLE.fontSize).toBeGreaterThan(0);
  });
});

describe("mathToPdfText — fórmula maior que a coluna (achado 0427)", () => {
  const BLOCO =
    "\\int_{0}^{1} \\frac{x^2 + 1}{\\sqrt{x^3 + 2x}}\\,dx = \\sum_{n=1}^{\\infty} \\frac{1}{n^2}";

  it("mantém os espaços quebráveis para não perder texto no papel", () => {
    const out = mathToPdfText(BLOCO);
    expect(out).toBe(BLOCO);
    expect(out).not.toContain(" ");
  });

  it("o teto de caracteres cabe na coluna útil da folha A4", () => {
    const columnPt = 595.28 - 2 * 40;
    const charPt = 0.6 * MATH_PDF_STYLE.fontSize;
    expect(MATH_PDF_MAX_ATOM_CHARS * charPt).toBeLessThanOrEqual(columnPt);
    expect((MATH_PDF_MAX_ATOM_CHARS + 1) * charPt).toBeGreaterThan(columnPt);
  });

  it("nenhum trecho entre espaços da fórmula em bloco estoura a coluna", () => {
    for (const chunk of mathToPdfText(BLOCO).split(" ")) {
      expect(chunk.length).toBeLessThanOrEqual(MATH_PDF_MAX_ATOM_CHARS);
    }
  });
});

describe("mathBlockLines — a fórmula em bloco quebra onde a coluna manda (achado 0433)", () => {
  const BLOCO =
    "\\int_{0}^{1} \\frac{x^2 + 1}{\\sqrt{x^3 + 2x}}\\,dx = \\sum_{n=1}^{\\infty} \\frac{1}{n^2}";

  it("devolve uma linha só quando a fórmula cabe, com os espaços inquebráveis", () => {
    expect(mathBlockLines("(x+1)^2 = 0")).toEqual(["(x+1)^2 = 0"]);
  });

  it("quebra a fórmula longa em linhas que cabem na coluna", () => {
    const lines = mathBlockLines(BLOCO);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(MATH_PDF_MAX_ATOM_CHARS);
  });

  it("quebra no último espaço que cabe, sem perder caractere", () => {
    expect(mathBlockLines(BLOCO).join(" ").replace(/\s+/g, " ")).toBe(BLOCO.replace(/\s+/g, " "));
  });

  it("corta no seco quando não há espaço nenhum onde quebrar", () => {
    const semEspaco = "x".repeat(MATH_PDF_MAX_ATOM_CHARS + 5);
    const lines = mathBlockLines(semEspaco);
    expect(lines).toEqual(["x".repeat(MATH_PDF_MAX_ATOM_CHARS), "x".repeat(5)]);
  });
});
