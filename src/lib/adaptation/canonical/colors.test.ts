import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { ALLOWED_COLORS, isAllowedColor, normalizeColor } from "./colors";

/**
 * Drift guard: ALLOWED_COLORS mirrors the TEXT_COLORS + HIGHLIGHT_COLORS
 * palette in QuestionRichEditor.tsx (whose consts are not exported). Read the
 * source and extract the hex `value`s so adding a swatch there without updating
 * this allowlist fails the build — mirroring the adaptationCost sync test.
 */
function paletteHexFromEditor(): string[] {
  const path = resolve(
    process.cwd(),
    "src/components/forms/QuestionRichEditor.tsx",
  );
  const src = readFileSync(path, "utf8");
  const block = src.slice(
    src.indexOf("const HIGHLIGHT_COLORS"),
    src.indexOf("const FONT_FAMILIES"),
  );
  return [...block.matchAll(/value:\s*"(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
}

describe("ALLOWED_COLORS", () => {
  it("contains the text and highlight palette hex values", () => {
    expect(ALLOWED_COLORS).toContain("#1F2937");
    expect(ALLOWED_COLORS).toContain("#DC2626");
    expect(ALLOWED_COLORS).toContain("#FEF08A");
    expect(ALLOWED_COLORS).toContain("#DDD6FE");
  });

  it("is a non-empty readonly array", () => {
    expect(ALLOWED_COLORS.length).toBeGreaterThan(0);
  });

  it("stays in sync with the QuestionRichEditor palette (no drift)", () => {
    const editorHex = paletteHexFromEditor();
    expect(editorHex.length).toBe(12); // 6 highlight + 6 text
    expect([...ALLOWED_COLORS].sort()).toEqual([...editorHex].sort());
  });
});

describe("isAllowedColor", () => {
  it("returns true for the first ALLOWED_COLORS entry", () => {
    expect(isAllowedColor(ALLOWED_COLORS[0])).toBe(true);
  });

  it("returns true for all entries in the allowlist", () => {
    for (const color of ALLOWED_COLORS) {
      expect(isAllowedColor(color)).toBe(true);
    }
  });

  it("returns true case-insensitively", () => {
    expect(isAllowedColor("#1f2937")).toBe(true);
    expect(isAllowedColor("#FEF08A")).toBe(true);
  });

  it("returns false for CSS-injection strings", () => {
    expect(isAllowedColor("red; background:url(x)")).toBe(false);
    expect(isAllowedColor("red")).toBe(false);
    expect(isAllowedColor("")).toBe(false);
    expect(isAllowedColor("#000000")).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect(isAllowedColor(null as unknown as string)).toBe(false);
    expect(isAllowedColor(undefined as unknown as string)).toBe(false);
  });
});

/**
 * `normalizeColor` is the gate every color crosses on its way in from the DOM
 * (a Word/Docs paste, and our own clipboard — the browser serializes `#DC2626`
 * as `rgb(220, 38, 38)`). Anything it lets through must satisfy `isAllowedColor`,
 * or the canonical document stops validating and the autosave freezes silently.
 */
describe("normalizeColor", () => {
  it("is the identity on every palette color (our own clipboard round-trips)", () => {
    for (const color of ALLOWED_COLORS) {
      expect(normalizeColor(color)).toBe(color.toUpperCase());
    }
  });

  it("accepts the rgb() form the DOM serializes our palette into", () => {
    expect(normalizeColor("rgb(220, 38, 38)")).toBe("#DC2626");
    expect(normalizeColor("rgba(220, 38, 38, 0.5)")).toBe("#DC2626");
  });

  it("expands the #rgb short form and is case-insensitive", () => {
    // #F00 -> #FF0000 -> nearest palette red.
    expect(normalizeColor("#f00")).toBe("#DC2626");
    expect(normalizeColor("#dc2626")).toBe("#DC2626");
  });

  it("maps a foreign color to the NEAREST palette entry (keeps the emphasis)", () => {
    expect(normalizeColor("#FF0000")).toBe("#DC2626"); // red -> palette red
    expect(normalizeColor("#000000")).toBe("#1F2937"); // black -> palette ink
    expect(normalizeColor("rgb(255, 255, 0)")).toBe("#FEF08A"); // yellow -> highlight
  });

  it("returns null for values it cannot parse (caller leaves the text unstyled)", () => {
    expect(normalizeColor("inherit")).toBeNull();
    expect(normalizeColor("currentColor")).toBeNull();
    expect(normalizeColor("")).toBeNull();
    expect(normalizeColor("linear-gradient(red, blue)")).toBeNull();
    expect(normalizeColor("#12345")).toBeNull();
    expect(normalizeColor("rgb(300, 0, 0)")).toBeNull();
  });

  it("returns null for non-string values", () => {
    expect(normalizeColor(null)).toBeNull();
    expect(normalizeColor(undefined)).toBeNull();
    expect(normalizeColor(42)).toBeNull();
  });

  it("never returns a value outside the allowlist", () => {
    const probes = ["#FF0000", "#00FF00", "#123456", "rgb(1,2,3)", "#ABCDEF", "#fff"];
    for (const probe of probes) {
      expect(isAllowedColor(normalizeColor(probe))).toBe(true);
    }
  });
});
