import { describe, it, expect } from "vitest";
import {
  mathToPdfText,
  mathBlockLines,
  MATH_PDF_STYLE,
  MATH_PDF_MAX_ATOM_CHARS,
  mathPdfColumnChars,
  mathPdfSegments,
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
    // Courier primeiro (a métrica da fórmula); depois as de símbolos (C-01).
    expect(MATH_PDF_STYLE.fontFamily).toEqual(["Courier", "DejaVu Sans Mono", "DejaVu Sans"]);
    expect(MATH_PDF_STYLE.fontSize).toBeGreaterThan(0);
  });
});

describe("mathToPdfText — fórmula maior que a coluna (achado 0427)", () => {
  const BLOCO =
    "\\int_{0}^{1} \\frac{x^2 + 1}{\\sqrt{x^3 + 2x}}\\,dx = \\sum_{n=1}^{\\infty} \\frac{1}{n^2}";

  it("parte a fórmula em pedaços que cabem, sem perder texto no papel", () => {
    const out = mathToPdfText(BLOCO);
    // the pieces are atoms (NBSP inside) joined by the LaTeX's own spaces: same text, same order
    expect(out.replace(/\u00a0/g, " ")).toBe(BLOCO);
    for (const piece of out.split(" ")) expect(piece.length).toBeLessThanOrEqual(MATH_PDF_MAX_ATOM_CHARS);
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

describe("mathPdfColumnChars e mathPdfSegments: a coluna de verdade (N-M-001)", () => {
  const charPt = (ctx = 12) => 0.6 * MATH_PDF_STYLE.fontSize * (ctx / 12);

  it("sem coluna conhecida vale a coluna útil da folha", () => {
    expect(mathPdfColumnChars(undefined)).toBe(MATH_PDF_MAX_ATOM_CHARS);
  });

  it("uma coluna estreita comporta menos caracteres, nunca mais que a folha, nunca menos que 1", () => {
    const narrow = mathPdfColumnChars(150);
    expect(narrow).toBe(Math.floor(150 / charPt()));
    expect(narrow).toBeLessThan(MATH_PDF_MAX_ATOM_CHARS);
    expect(mathPdfColumnChars(10_000)).toBe(MATH_PDF_MAX_ATOM_CHARS);
    expect(mathPdfColumnChars(1)).toBe(1);
  });

  it("a fórmula que cabe na coluna continua UM átomo", () => {
    const segments = mathPdfSegments("x = 1 + 2", 12, 300);
    expect(segments).toHaveLength(1);
  });

  it("a fórmula da questão de pareamento parte em pedaços que cabem na coluna, sem hífen e sem perda", () => {
    const latex = String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`;
    const columnPt = 200;
    const chars = mathPdfColumnChars(columnPt);
    const segments = mathPdfSegments(latex, 12, columnPt);
    expect(segments.length).toBeGreaterThan(1);
    for (const s of segments) expect(s.text.length).toBeLessThanOrEqual(chars);
    expect(mathToPdfText(latex, 12, columnPt).replace(/\u00a0/g, " ")).toBe(latex);
  });

  it("o tamanho do corpo muda quantos caracteres cabem", () => {
    expect(mathPdfColumnChars(200, 16)).toBeLessThan(mathPdfColumnChars(200, 12));
  });
});
