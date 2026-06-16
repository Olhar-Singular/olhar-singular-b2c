import { describe, it, expect } from "vitest";
import {
  FONT_FAMILY_TOKENS,
  FONT_FAMILY_OPTIONS,
  APPEARANCE_FONT_GROUPS,
  isFontFamilyToken,
  fontFamilyToCss,
  fontFamilyToPdf,
} from "./fontFamily";

describe("fontFamily tokens", () => {
  it("exposes the classic + accessibility tokens", () => {
    expect(FONT_FAMILY_TOKENS).toEqual([
      "sans",
      "serif",
      "mono",
      "atkinson",
      "lexend",
      "opendyslexic",
      "georgia",
      "arial",
    ]);
  });

  it("offers a labelled option per token", () => {
    expect(FONT_FAMILY_OPTIONS.map((o) => o.value)).toEqual([...FONT_FAMILY_TOKENS]);
    for (const o of FONT_FAMILY_OPTIONS) expect(o.label).toBeTruthy();
  });
});

describe("APPEARANCE_FONT_GROUPS (popover Aparência, D12)", () => {
  it("groups accessibility and classic fonts", () => {
    expect(APPEARANCE_FONT_GROUPS.map((g) => g.group)).toEqual(["acessibilidade", "classicas"]);
  });

  it("lists the accessibility fonts under Acessibilidade", () => {
    const a11y = APPEARANCE_FONT_GROUPS.find((g) => g.group === "acessibilidade")!;
    expect(a11y.options.map((o) => o.value)).toEqual(["atkinson", "lexend", "opendyslexic"]);
  });

  it("lists the classic fonts under Clássicas", () => {
    const classic = APPEARANCE_FONT_GROUPS.find((g) => g.group === "classicas")!;
    expect(classic.options.map((o) => o.value)).toEqual(["georgia", "arial"]);
  });

  it("only references real font tokens", () => {
    for (const grp of APPEARANCE_FONT_GROUPS) {
      for (const o of grp.options) {
        expect(isFontFamilyToken(o.value)).toBe(true);
        expect(o.label).toBeTruthy();
      }
    }
  });
});

describe("isFontFamilyToken", () => {
  it("accepts every token", () => {
    for (const t of FONT_FAMILY_TOKENS) expect(isFontFamilyToken(t)).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isFontFamilyToken("Arial")).toBe(false); // capitalized → not a token
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
    ["atkinson", "'Atkinson Hyperlegible', sans-serif", "Atkinson Hyperlegible"],
    ["lexend", "'Lexend', sans-serif", "Lexend"],
    ["opendyslexic", "'OpenDyslexic', sans-serif", "OpenDyslexic"],
    ["georgia", "Georgia, serif", "Times-Roman"],
    ["arial", "Arial, Helvetica, sans-serif", "Helvetica"],
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
