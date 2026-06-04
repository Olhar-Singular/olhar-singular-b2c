import { describe, it, expect } from "vitest";
import { nodeStyleToCss } from "./style";

describe("nodeStyleToCss", () => {
  it("returns empty object for undefined style", () => {
    expect(nodeStyleToCss(undefined)).toEqual({});
  });
  it("returns empty object for empty style", () => {
    expect(nodeStyleToCss({})).toEqual({});
  });
  it("maps a logical fontFamily token to a CSS stack", () => {
    expect(nodeStyleToCss({ fontFamily: "serif" })).toEqual({
      fontFamily: "Times New Roman, Times, serif",
    });
  });
  it("passes an unknown fontFamily through unchanged (legacy docs)", () => {
    expect(nodeStyleToCss({ fontFamily: "Arial" })).toEqual({ fontFamily: "Arial" });
  });
  it("maps fontSize (number) to px", () => {
    expect(nodeStyleToCss({ fontSize: 18 })).toEqual({ fontSize: "18px" });
  });
  it("maps align to textAlign", () => {
    expect(nodeStyleToCss({ align: "center" })).toEqual({ textAlign: "center" });
  });
  it("maps color", () => {
    expect(nodeStyleToCss({ color: "#DC2626" })).toEqual({ color: "#DC2626" });
  });
  it("maps spacingAfter to marginBottom px", () => {
    expect(nodeStyleToCss({ spacingAfter: 12 })).toEqual({ marginBottom: "12px" });
  });
  it("maps spacingAfter of 0 to marginBottom 0px", () => {
    expect(nodeStyleToCss({ spacingAfter: 0 })).toEqual({ marginBottom: "0px" });
  });
  it("maps pageBreakBefore true to breakBefore page", () => {
    expect(nodeStyleToCss({ pageBreakBefore: true })).toEqual({ breakBefore: "page" });
  });
  it("omits pageBreakBefore when false", () => {
    expect(nodeStyleToCss({ pageBreakBefore: false })).toEqual({});
  });
  it("ignores a non-allowlisted color", () => {
    expect(nodeStyleToCss({ color: "red; background:url(x)" })).toEqual({});
  });
  it("combines multiple properties", () => {
    expect(
      nodeStyleToCss({
        fontFamily: "Georgia",
        fontSize: 14,
        align: "right",
        color: "#2563EB",
        spacingAfter: 8,
        pageBreakBefore: true,
      })
    ).toEqual({
      fontFamily: "Georgia",
      fontSize: "14px",
      textAlign: "right",
      color: "#2563EB",
      marginBottom: "8px",
      breakBefore: "page",
    });
  });
});
