import { describe, it, expect } from "vitest";
import { parsePositiveNumber, captionFromPlain, latexToHtml, inlineLatexToHtml } from "./nodeViewUtils";
import { renderLatexToHtml } from "@/lib/domain/latexRenderer";

describe("parsePositiveNumber", () => {
  it("returns a positive number", () => {
    expect(parsePositiveNumber("3")).toBe(3);
  });
  it("returns null for zero/negative/non-numeric", () => {
    expect(parsePositiveNumber("0")).toBeNull();
    expect(parsePositiveNumber("-2")).toBeNull();
    expect(parsePositiveNumber("abc")).toBeNull();
  });
});

describe("captionFromPlain", () => {
  it("returns undefined for empty string", () => {
    expect(captionFromPlain("")).toBeUndefined();
  });
  it("wraps text into a RichText", () => {
    expect(captionFromPlain("hi")).toEqual([{ type: "text", text: "hi" }]);
  });
});

describe("latexToHtml", () => {
  it("renders bare KaTeX in display mode, identical to the read-only renderer", () => {
    // Same engine + displayMode as BlockMathView so editor preview can never
    // diverge from the final render.
    expect(latexToHtml("a+b")).toBe(renderLatexToHtml("a+b", true));
  });
});

describe("inlineLatexToHtml", () => {
  it("renders bare KaTeX inline, identical to the read-only RichTextView", () => {
    expect(inlineLatexToHtml("x^2")).toBe(renderLatexToHtml("x^2", false));
  });
});
