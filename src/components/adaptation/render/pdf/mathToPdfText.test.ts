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

describe("mathBlockLines — a fórmula em bloco quebra equilibrada (achados 0433 e 0435)", () => {
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

  it("quebra no espaço mais perto do alvo, sem perder caractere", () => {
    expect(mathBlockLines(BLOCO).join(" ").replace(/\s+/g, " ")).toBe(BLOCO.replace(/\s+/g, " "));
  });

  it("corta no seco, e ainda assim equilibrado, quando não há espaço nenhum", () => {
    const semEspaco = "x".repeat(MATH_PDF_MAX_ATOM_CHARS + 5);
    const lines = mathBlockLines(semEspaco);
    const alvo = Math.ceil(semEspaco.length / 2);
    expect(lines).toEqual(["x".repeat(alvo), "x".repeat(semEspaco.length - alvo)]);
  });
});

describe("math no PDF imprime a descrição legível quando existe (achado 0401)", () => {
  const BLOCO =
    "\\int_{0}^{1} \\frac{x^2 + 1}{\\sqrt{x^3 + 2x}}\\,dx = \\sum_{n=1}^{\\infty} \\frac{1}{n^2}";
  const ALT = "integral de 0 a 1 de x ao quadrado mais 1 sobre raiz de x ao cubo mais 2x";

  it("inline: o alt vence o LaTeX cru", () => {
    expect(mathToPdfText("(x+1)^2 = 0", "x mais 1, ao quadrado, igual a zero")).toBe(
      "x mais 1, ao quadrado, igual a zero",
    );
  });

  it("inline: sem alt continua saindo o LaTeX costurado", () => {
    expect(mathToPdfText("(x+1)^2 = 0")).toBe("(x+1)^2\u00a0=\u00a00");
    expect(mathToPdfText("(x+1)^2 = 0", "  ")).toBe("(x+1)^2\u00a0=\u00a00");
  });

  it("bloco: o alt sai como texto natural, numa linha só e com espaços quebráveis", () => {
    expect(mathBlockLines(BLOCO, ALT)).toEqual([ALT]);
  });

  it("bloco: sem alt continua quebrando o LaTeX pela coluna", () => {
    expect(mathBlockLines(BLOCO).length).toBeGreaterThan(1);
  });
});
