import { describe, it, expect } from "vitest";
import { nodeStyleToPdf, pageBreakBefore } from "./nodeStyleToPdf";
import { BASE_LINE_HEIGHT } from "../pageTokens";

describe("nodeStyleToPdf", () => {
  it("returns an empty object for undefined style", () => {
    expect(nodeStyleToPdf(undefined)).toEqual({});
  });

  it("maps every supported field (logical token → built-in family)", () => {
    expect(
      nodeStyleToPdf({
        fontFamily: "serif",
        fontSize: 14,
        align: "center",
        color: "#2563EB",
        spacingAfter: 12,
      }),
    ).toEqual({
      fontFamily: "Times-Roman",
      fontSize: 10.5,      // 14px → 10.5pt
      // O corpo próprio vem acompanhado da razão de entrelinha: sem ela o
      // react-pdf congelaria o 1,4 do <Page> em 16,8pt absolutos (achado 0429).
      lineHeight: BASE_LINE_HEIGHT,
      textAlign: "center",
      color: "#2563EB",
      marginBottom: 9,     // 12px → 9pt
    });
  });

  it("converts fontSize and spacingAfter from px (screen) to pt (PDF)", () => {
    const out = nodeStyleToPdf({ fontSize: 16, spacingAfter: 20 });
    expect(out.fontSize).toBe(12);     // 16px → 12pt (matches the 12pt doc base)
    expect(out.marginBottom).toBe(15); // 20px → 15pt
  });

  it("passes an unknown fontFamily through unchanged (legacy docs)", () => {
    expect(nodeStyleToPdf({ fontFamily: "Georgia" }).fontFamily).toBe("Georgia");
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
