import { describe, it, expect } from "vitest";
import { latexBalancedLines, latexLayoutAtom, latexLayoutSegments, MATH_NBSP, type MathSegment } from "./mathAtom";

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

/** What the segments print when every joint is taken: spaces kept, soft joints invisible. */
const reassemble = (segments: MathSegment[]) =>
  segments.map((s, i) => (i === 0 ? "" : s.joint === "space" ? " " : "") + s.text.replace(/\u00a0/g, " ")).join("");
const squashed = (s: string) => s.replace(/\s+/g, "");

describe("latexLayoutSegments (N-M-001, N-U-001)", () => {
  const QUADRATIC = String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`;

  it("returns the whole formula as ONE atom when it fits the column", () => {
    expect(latexLayoutSegments("(x+1)^2 = 0", 50)).toEqual([{ text: `(x+1)^2${MATH_NBSP}=${MATH_NBSP}0`, joint: "none" }]);
  });

  it("cuts at the LaTeX spaces when it does not fit, each piece an atom within the column", () => {
    const segments = latexLayoutSegments(QUADRATIC, 20);
    expect(segments.length).toBeGreaterThan(1);
    for (const s of segments) expect(s.text.length).toBeLessThanOrEqual(20);
    expect(segments.slice(1).every((s) => s.joint === "space")).toBe(true);
    expect(reassemble(segments)).toBe(QUADRATIC);
  });

  it("loses no character and adds none (no hyphen) in any column width", () => {
    for (let width = 4; width <= 60; width += 1) {
      const segments = latexLayoutSegments(QUADRATIC, width);
      expect(squashed(reassemble(segments))).toBe(squashed(QUADRATIC));
      for (const s of segments) expect(s.text.length).toBeLessThanOrEqual(Math.max(width, 1));
    }
  });

  it("cuts a formula with no space at a safe point, after an operator, as an invisible joint", () => {
    const sum = Array.from({ length: 80 }, (_, i) => i + 1).join("+");
    const segments = latexLayoutSegments(sum, 40);
    expect(segments.length).toBeGreaterThan(5);
    for (const s of segments) expect(s.text.length).toBeLessThanOrEqual(40);
    expect(segments.slice(1).every((s) => s.joint === "soft")).toBe(true);
    // every cut falls right after a "+": no number is split ("17" never becomes "1" / "7")
    for (const s of segments.slice(0, -1)) expect(s.text.endsWith("+")).toBe(true);
    expect(reassemble(segments)).toBe(sum);
  });

  it("never cuts inside a control word or right after its backslash", () => {
    const latex = String.raw`\begin{vmatrix}2&3\\1&4\end{vmatrix}+\sqrt{b}\cdot\alpha`;
    for (let width = 8; width <= 30; width += 1) {
      const segments = latexLayoutSegments(latex, width);
      expect(reassemble(segments)).toBe(latex);
      segments.slice(1).forEach((s, i) => {
        // mark each cut with "|" and look at what surrounds it
        const marked = segments[i].text + "|" + s.text;
        expect(marked).not.toMatch(/\\[A-Za-z]*\|[A-Za-z]/); // inside \command
        expect(marked).not.toMatch(/(?<!\\)(?:\\\\)*\\\|/); // right after a lone backslash
      });
    }
  });

  it("keeps digits of one number together when a better point exists", () => {
    const segments = latexLayoutSegments("1234567890+1234567890+1234567890", 14);
    for (const s of segments.slice(0, -1)) expect(s.text.endsWith("+")).toBe(true);
  });

  it("prefers a neutral point to the middle of a number even when the number cut is nearer the target (L10 C5)", () => {
    const segments = latexLayoutSegments("1234x6789012345", 11);
    expect(segments[0].text).toBe("1234x");
    expect(reassemble(segments)).toBe("1234x6789012345");
  });

  it("terminates and keeps everything for absurdly narrow columns", () => {
    const segments = latexLayoutSegments(QUADRATIC, 1);
    expect(squashed(reassemble(segments))).toBe(squashed(QUADRATIC));
    expect(latexLayoutSegments("", 10)).toEqual([{ text: "", joint: "none" }]);
  });

  it("looks left of the window for a safe point when the window sits inside a command", () => {
    const latex = "x\\alphabetagammadeltaepsilon";
    const segments = latexLayoutSegments(latex, 8);
    expect(squashed(reassemble(segments))).toBe(squashed(latex));
    expect(segments[0].text).toBe("x");
  });

  it("falls back to the hard limit when no safe point exists at all", () => {
    const latex = "\\alphabetagammadelta";
    const segments = latexLayoutSegments(latex, 8);
    expect(squashed(reassemble(segments))).toBe(squashed(latex));
    expect(segments.length).toBeGreaterThan(1);
  });
});

describe("latexBalancedLines cuts a formula with no space at a safe point (N-M-001)", () => {
  it("cuts after an operator, not in the middle of a number or a command", () => {
    const lines = latexBalancedLines("111111+222222+333333+444444", 14);
    expect(lines.every((l) => l.length <= 14)).toBe(true);
    for (const l of lines.slice(0, -1)) expect(l.endsWith("+")).toBe(true);
    expect(lines.join("")).toBe("111111+222222+333333+444444");
  });
});
