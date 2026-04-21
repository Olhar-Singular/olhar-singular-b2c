import { describe, it, expect } from "vitest";
import { hasMathContent, renderMathToHtml } from "./latexRenderer";

describe("hasMathContent", () => {
  it("returns false for empty string", () => {
    expect(hasMathContent("")).toBe(false);
  });
  it("returns false for plain prose", () => {
    expect(hasMathContent("O professor ensina matemática básica.")).toBe(false);
  });
  it("detects explicit LaTeX $...$", () => {
    expect(hasMathContent("Calcule $x^2 + 1$")).toBe(true);
  });
  it("detects \\frac", () => {
    expect(hasMathContent("A fração \\frac{1}{2}")).toBe(true);
  });
  it("detects \\sqrt", () => {
    expect(hasMathContent("\\sqrt{9} = 3")).toBe(true);
  });
  it("detects superscript x^2", () => {
    expect(hasMathContent("energia = mc^2")).toBe(true);
  });
  it("detects subscript x_1", () => {
    expect(hasMathContent("velocidade v_0")).toBe(true);
  });
  it("does NOT flag km/h as math (word boundary)", () => {
    expect(hasMathContent("velocidade 60 km/h")).toBe(false);
  });
  it("detects numeric fraction 3/4 as math", () => {
    expect(hasMathContent("resposta: 3/4")).toBe(true);
  });
});

describe("renderMathToHtml", () => {
  it("returns empty string for empty input", () => {
    expect(renderMathToHtml("")).toBe("");
  });
  it("leaves plain text unchanged (no KaTeX tags)", () => {
    const result = renderMathToHtml("texto simples");
    expect(result).toBe("texto simples");
  });
  it("renders $...$ inline LaTeX to KaTeX HTML", () => {
    const result = renderMathToHtml("Calcule $x^2$");
    expect(result).toContain("katex");
  });
  it("renders \\frac to KaTeX HTML", () => {
    const result = renderMathToHtml("\\frac{1}{2}");
    expect(result).toContain("katex");
  });
  it("converts newlines to <br/>", () => {
    const result = renderMathToHtml("linha1\nlinha2");
    expect(result).toContain("<br/>");
  });
  it("does not break on null/undefined (returns empty string)", () => {
    expect(renderMathToHtml(null as any)).toBe("");
    expect(renderMathToHtml(undefined as any)).toBe("");
  });
});
