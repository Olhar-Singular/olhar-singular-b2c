import { describe, it, expect } from "vitest";
import { nodeStyleToPdf, pageBreakBefore } from "./nodeStyleToPdf";

describe("nodeStyleToPdf", () => {
  it("returns an empty object for undefined style", () => {
    expect(nodeStyleToPdf(undefined)).toEqual({});
  });

  it("maps every supported field", () => {
    expect(
      nodeStyleToPdf({
        fontFamily: "Georgia",
        fontSize: 14,
        align: "center",
        color: "#2563EB",
        spacingAfter: 12,
      }),
    ).toEqual({
      fontFamily: "Georgia",
      fontSize: 14,
      textAlign: "center",
      color: "#2563EB",
      marginBottom: 12,
    });
  });

  it("drops a disallowed color (palette guard)", () => {
    const out = nodeStyleToPdf({ color: "#123456" });
    expect(out.color).toBeUndefined();
  });

  it("never emits a pageBreak style key (driven by the break prop instead)", () => {
    expect(nodeStyleToPdf({ pageBreakBefore: true })).toEqual({});
  });
});

describe("pageBreakBefore", () => {
  it("is true only when pageBreakBefore is set", () => {
    expect(pageBreakBefore({ pageBreakBefore: true })).toBe(true);
    expect(pageBreakBefore({ pageBreakBefore: false })).toBe(false);
    expect(pageBreakBefore({})).toBe(false);
    expect(pageBreakBefore(undefined)).toBe(false);
  });
});
