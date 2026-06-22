import { describe, it, expect } from "vitest";
import { marksToClassName, textRunStyle } from "./richTextMarks";

describe("marksToClassName", () => {
  it("returns empty string for no marks", () => {
    expect(marksToClassName(undefined)).toBe("");
    expect(marksToClassName([])).toBe("");
  });
  it("maps bold", () => {
    expect(marksToClassName(["bold"])).toBe("font-bold");
  });
  it("maps italic", () => {
    expect(marksToClassName(["italic"])).toBe("italic");
  });
  it("maps underline", () => {
    expect(marksToClassName(["underline"])).toBe("underline");
  });
  it("maps strike", () => {
    expect(marksToClassName(["strike"])).toBe("line-through");
  });
  it("combines underline and strike in one class string", () => {
    expect(marksToClassName(["underline", "strike"])).toBe("underline line-through");
  });
  it("combines all marks", () => {
    expect(marksToClassName(["bold", "italic", "underline", "strike"])).toBe(
      "font-bold italic underline line-through"
    );
  });
});

describe("textRunStyle", () => {
  it("returns empty object when no color", () => {
    expect(textRunStyle(undefined)).toEqual({});
  });
  it("maps an allowlisted color", () => {
    expect(textRunStyle("#16A34A")).toEqual({ color: "#16A34A" });
  });
  it("ignores a non-allowlisted color", () => {
    expect(textRunStyle("orange; x")).toEqual({});
  });
  it("applies fontSize in pt when provided", () => {
    expect(textRunStyle(undefined, 12)).toEqual({ fontSize: "12pt" });
  });
  it("applies both color and fontSize when both are provided", () => {
    expect(textRunStyle("#16A34A", 14)).toEqual({ color: "#16A34A", fontSize: "14pt" });
  });
  it("ignores fontSize when it is zero or negative", () => {
    expect(textRunStyle(undefined, 0)).toEqual({});
  });
});
