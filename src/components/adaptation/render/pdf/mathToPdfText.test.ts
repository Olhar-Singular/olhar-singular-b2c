import { describe, it, expect } from "vitest";
import { mathToPdfText, MATH_PDF_STYLE } from "./mathToPdfText";

describe("mathToPdfText", () => {
  it("returns the LaTeX source verbatim (v1 projection)", () => {
    expect(mathToPdfText("\\frac{a}{b}")).toBe("\\frac{a}{b}");
  });

  it("exposes a monospace style for math runs", () => {
    expect(MATH_PDF_STYLE.fontFamily).toBe("Courier");
    expect(MATH_PDF_STYLE.fontSize).toBeGreaterThan(0);
  });
});
