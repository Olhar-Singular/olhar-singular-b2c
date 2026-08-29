import { describe, it, expect } from "vitest";
import { mathToPdfText, MATH_PDF_STYLE } from "./mathToPdfText";

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
