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
});
