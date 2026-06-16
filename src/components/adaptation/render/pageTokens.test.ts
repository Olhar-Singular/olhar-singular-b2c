import { describe, it, expect } from "vitest";
import {
  PAGE_MARGIN_PT,
  BASE_FONT_PT,
  BASE_LINE_HEIGHT,
  BASE_BLOCK_SPACING_PX,
  pageTokensToPdf,
  pageTokensToCss,
} from "./pageTokens";

describe("pageTokens", () => {
  it("expõe as constantes canônicas da página (espelham o PDF atual)", () => {
    expect(PAGE_MARGIN_PT).toBe(40);
    expect(BASE_FONT_PT).toBe(12);
    expect(BASE_LINE_HEIGHT).toBe(1.4);
    expect(BASE_BLOCK_SPACING_PX).toBe(16);
  });

  it("pageTokensToPdf devolve o estilo base do <Page> em pt (sem args = defaults atuais)", () => {
    expect(pageTokensToPdf()).toEqual({
      flexDirection: "column",
      padding: 40,
      fontSize: 12,
      lineHeight: 1.4,
    });
  });

  it("pageTokensToCss converte pt->px (96/72) para a folha da tela (sem args = defaults)", () => {
    const css = pageTokensToCss();
    expect(css.padding).toBe("53.33px"); // 40 * 96/72
    expect(css.fontSize).toBe("16px"); // 12 * 96/72
    expect(css.lineHeight).toBe(1.4);
  });
});

describe("pageTokens — parametrizado por pageStyle (Fase 4a)", () => {
  it("pageTokensToCss aplica fontSize (pt->px) e a CSS var de espaçamento", () => {
    const css = pageTokensToCss({ fontFamily: undefined, fontSize: 18, blockSpacing: 24 });
    expect(css.fontSize).toBe("24px"); // 18 * 96/72
    expect((css as Record<string, unknown>)["--doc-block-spacing"]).toBe("24px");
  });

  it("pageTokensToCss sem fontFamily não emite a propriedade fontFamily", () => {
    const css = pageTokensToCss({ fontFamily: undefined, fontSize: 12, blockSpacing: 16 });
    expect("fontFamily" in css).toBe(false);
  });

  it("pageTokensToCss com fontFamily mapeia para o stack CSS do token", () => {
    const css = pageTokensToCss({ fontFamily: "mono", fontSize: 12, blockSpacing: 16 });
    expect(css.fontFamily).toBe("Courier New, Courier, monospace");
  });

  it("pageTokensToPdf aplica fontSize em pt e mapeia o fontFamily do token", () => {
    const pdf = pageTokensToPdf({ fontFamily: "serif", fontSize: 13, blockSpacing: 20 });
    expect(pdf.fontSize).toBe(13);
    expect(pdf.fontFamily).toBe("Times-Roman");
  });

  it("pageTokensToPdf sem fontFamily não emite a propriedade fontFamily", () => {
    const pdf = pageTokensToPdf({ fontFamily: undefined, fontSize: 12, blockSpacing: 16 });
    expect("fontFamily" in pdf).toBe(false);
  });
});
