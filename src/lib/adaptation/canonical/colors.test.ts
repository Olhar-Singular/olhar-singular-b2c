import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { ALLOWED_COLORS, isAllowedColor } from "./colors";

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
