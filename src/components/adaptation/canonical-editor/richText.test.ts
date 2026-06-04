import { describe, it, expect } from "vitest";
import { richTextToPlain } from "./richText";

describe("richTextToPlain", () => {
  it("joins text runs", () => {
    expect(
      richTextToPlain([
        { type: "text", text: "Hello " },
        { type: "text", text: "world" },
      ])
    ).toBe("Hello world");
  });

  it("renders inlineMath as a $...$ token", () => {
    expect(
      richTextToPlain([
        { type: "text", text: "x = " },
        { type: "inlineMath", latex: "x^2" },
      ])
    ).toBe("x = $x^2$");
  });

  it("returns empty string for empty rich text", () => {
    expect(richTextToPlain([])).toBe("");
  });

  it("returns empty string for undefined input", () => {
    expect(richTextToPlain(undefined)).toBe("");
  });
});
