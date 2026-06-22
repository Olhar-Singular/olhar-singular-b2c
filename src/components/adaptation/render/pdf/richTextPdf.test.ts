import { describe, it, expect } from "vitest";
import { marksToPdfStyle } from "./richTextPdf";

describe("marksToPdfStyle", () => {
  it("returns an empty style for no marks and no color", () => {
    expect(marksToPdfStyle()).toEqual({});
  });

  it("maps bold and italic", () => {
    expect(marksToPdfStyle(["bold", "italic"])).toEqual({
      fontWeight: "bold",
      fontStyle: "italic",
    });
  });

  it("combines underline and strike into a single textDecoration", () => {
    expect(marksToPdfStyle(["underline", "strike"]).textDecoration).toBe("underline line-through");
  });

  it("emits underline alone", () => {
    expect(marksToPdfStyle(["underline"]).textDecoration).toBe("underline");
  });

  it("applies an allowlisted color", () => {
    expect(marksToPdfStyle(undefined, "#DC2626").color).toBe("#DC2626");
  });

  it("drops a disallowed color", () => {
    expect(marksToPdfStyle(undefined, "#abcdef").color).toBeUndefined();
  });

  it("applies fontSize in pt (as a number) when provided", () => {
    expect(marksToPdfStyle(undefined, undefined, 12)).toMatchObject({ fontSize: 12 });
  });

  it("applies fontSize together with marks and color", () => {
    const style = marksToPdfStyle(["bold"], "#DC2626", 14);
    expect(style.fontWeight).toBe("bold");
    expect(style.color).toBe("#DC2626");
    expect(style.fontSize).toBe(14);
  });

  it("ignores fontSize when it is zero", () => {
    expect((marksToPdfStyle(undefined, undefined, 0) as Record<string, unknown>).fontSize).toBeUndefined();
  });
});
