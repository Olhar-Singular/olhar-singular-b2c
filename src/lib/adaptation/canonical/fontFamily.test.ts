import { describe, it, expect } from "vitest";
import {
  FONT_FAMILY_TOKENS,
  FONT_FAMILY_OPTIONS,
  isFontFamilyToken,
  fontFamilyToCss,
  fontFamilyToPdf,
} from "./fontFamily";

describe("fontFamily tokens", () => {
  it("exposes exactly the three logical tokens", () => {
    expect(FONT_FAMILY_TOKENS).toEqual(["sans", "serif", "mono"]);
  });

  it("offers a labelled option per token", () => {
    expect(FONT_FAMILY_OPTIONS.map((o) => o.value)).toEqual([...FONT_FAMILY_TOKENS]);
    for (const o of FONT_FAMILY_OPTIONS) expect(o.label).toBeTruthy();
  });
});

describe("isFontFamilyToken", () => {
  it("accepts the three tokens", () => {
    expect(isFontFamilyToken("sans")).toBe(true);
    expect(isFontFamilyToken("serif")).toBe(true);
    expect(isFontFamilyToken("mono")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isFontFamilyToken("Arial")).toBe(false);
    expect(isFontFamilyToken("")).toBe(false);
    expect(isFontFamilyToken(42)).toBe(false);
    expect(isFontFamilyToken(undefined)).toBe(false);
  });
});

describe("token maps in BOTH directions (screen + PDF parity)", () => {
  it.each([
    ["sans", "Helvetica, Arial, sans-serif", "Helvetica"],
    ["serif", "Times New Roman, Times, serif", "Times-Roman"],
    ["mono", "Courier New, Courier, monospace", "Courier"],
  ])("%s → css %s / pdf %s", (token, css, pdf) => {
    expect(fontFamilyToCss(token)).toBe(css);
    expect(fontFamilyToPdf(token)).toBe(pdf);
  });
});

describe("unknown values pass through unchanged (legacy documents)", () => {
  it("css passthrough", () => {
    expect(fontFamilyToCss("Georgia")).toBe("Georgia");
  });
  it("pdf passthrough", () => {
    expect(fontFamilyToPdf("Georgia")).toBe("Georgia");
  });
});
