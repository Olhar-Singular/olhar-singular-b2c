import { describe, it, expect } from "vitest";
import {
  resolvePageStyle,
  resolveElementFontSizes,
  ELEMENT_FONT_RATIOS,
  PAGE_STYLE_DEFAULTS,
} from "./pageStyle";
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

/**
 * Regressão de paridade: a instrução/enunciado eram 10.5pt FIXOS no PDF e
 * relativos (`0.94em`) na folha. Subir o tamanho do texto na Aparência — que é
 * justamente o recurso de acessibilidade que mais importa aqui — aumentava a
 * prova na tela e deixava a instrução miúda no papel. E `elementFontSizes`, que
 * existe no schema, era ignorado pelo PDF e pelo renderer read-only.
 *
 * Um único resolvedor, em pt, alimenta as três superfícies: proporção do tamanho
 * base por padrão, override explícito quando o documento traz um.
 */
describe("resolveElementFontSizes", () => {
  it("derives every element size from the base font size", () => {
    expect(resolveElementFontSizes(resolvePageStyle({ fontSize: 12 }))).toEqual({
      stem: 12,
      instruction: 12 * ELEMENT_FONT_RATIOS.instruction,
      alternative: 12,
      caption: 12 * ELEMENT_FONT_RATIOS.caption,
    });
  });

  it("scales with the document font size (the accessibility case)", () => {
    const sizes = resolveElementFontSizes(resolvePageStyle({ fontSize: 18 }));
    expect(sizes.stem).toBe(18);
    expect(sizes.instruction).toBeCloseTo(18 * ELEMENT_FONT_RATIOS.instruction, 5);
    expect(sizes.instruction).toBeGreaterThan(12);
  });

  it("lets an explicit elementFontSizes override the derived value, per key", () => {
    const sizes = resolveElementFontSizes(
      resolvePageStyle({ fontSize: 12, elementFontSizes: { instruction: 20 } }),
    );
    expect(sizes.instruction).toBe(20);
    // Untouched keys keep following the base size.
    expect(sizes.stem).toBe(12);
  });

  it("keeps the PDF's historical proportions at the default 12pt base", () => {
    const sizes = resolveElementFontSizes(resolvePageStyle());
    expect(sizes.instruction).toBeCloseTo(10.5, 5);
    expect(sizes.caption).toBeCloseTo(10, 5);
  });
});
