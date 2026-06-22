import { describe, it, expect } from "vitest";
import { resolvePageStyle, PAGE_STYLE_DEFAULTS } from "./pageStyle";
import { BASE_FONT_PT } from "./pageTokens";

describe("resolvePageStyle", () => {
  it("returns the defaults when given nothing", () => {
    expect(resolvePageStyle()).toEqual({
      fontFamily: undefined,
      fontSize: BASE_FONT_PT,
      blockSpacing: 16,
    });
  });

  it("returns the defaults when given an empty object", () => {
    expect(resolvePageStyle({})).toEqual(PAGE_STYLE_DEFAULTS);
  });

  it("keeps fontFamily undefined when absent (preserves current appearance)", () => {
    expect(resolvePageStyle({ fontSize: 14 }).fontFamily).toBeUndefined();
  });

  it("applies partial overrides over the defaults", () => {
    expect(resolvePageStyle({ fontFamily: "lexend", blockSpacing: 24 })).toEqual({
      fontFamily: "lexend",
      fontSize: BASE_FONT_PT,
      blockSpacing: 24,
    });
  });

  it("respects an explicit fontSize and blockSpacing", () => {
    expect(resolvePageStyle({ fontSize: 18, blockSpacing: 8 })).toEqual({
      fontFamily: undefined,
      fontSize: 18,
      blockSpacing: 8,
    });
  });

  it("passes through elementFontSizes when present", () => {
    const efs = { stem: 14, instruction: 10 };
    expect(resolvePageStyle({ elementFontSizes: efs })).toEqual({
      fontFamily: undefined,
      fontSize: BASE_FONT_PT,
      blockSpacing: 16,
      elementFontSizes: efs,
    });
  });

  it("does not include elementFontSizes key when absent", () => {
    expect("elementFontSizes" in resolvePageStyle({})).toBe(false);
  });
});
