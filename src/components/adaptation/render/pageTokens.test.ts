import { describe, it, expect } from "vitest";
import {
  PAGE_MARGIN_PT,
  BASE_FONT_PT,
  BASE_LINE_HEIGHT,
  BASE_BLOCK_SPACING_PX,
  pageTokensToPdf,
  pageTokensToCss,
  DEFAULT_FONT_FAMILY_TOKEN,
} from "./pageTokens";
import { fontFamilyToCss, fontFamilyToPdf } from "@/lib/adaptation/canonical/fontFamily";

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
      fontFamily: "Helvetica",
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

  it("pageTokensToCss sem fontFamily emite o stack do token default (paridade com o PDF)", () => {
    const css = pageTokensToCss({ fontFamily: undefined, fontSize: 12, blockSpacing: 16 });
    expect(css.fontFamily).toBe("Helvetica, Arial, sans-serif");
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

  it("pageTokensToPdf sem fontFamily emite a família do token default (o built-in de antes)", () => {
    const pdf = pageTokensToPdf({ fontFamily: undefined, fontSize: 12, blockSpacing: 16 });
    expect(pdf.fontFamily).toBe("Helvetica");
  });
});

/**
 * Achado 0007: um documento SEM `pageStyle.fontFamily` (o caso normal, já que
 * nenhuma UI grava a fonte até o professor escolher uma) saía com tipografias
 * diferentes nas duas superfícies: a folha herdava a fonte do app
 * (Plus Jakarta Sans) e o PDF caía no built-in Helvetica do @react-pdf.
 */
describe("pageTokens — paridade de fonte sem override (achado 0007)", () => {
  it("emite a MESMA família nas duas superfícies quando o documento não define fontFamily", () => {
    const resolved = { fontFamily: undefined, fontSize: 12, blockSpacing: 16 };
    const css = pageTokensToCss(resolved);
    const pdf = pageTokensToPdf(resolved);

    expect(css.fontFamily).toBe(fontFamilyToCss(DEFAULT_FONT_FAMILY_TOKEN));
    expect(pdf.fontFamily).toBe(fontFamilyToPdf(DEFAULT_FONT_FAMILY_TOKEN));
  });

  it("mantém o PDF no built-in Helvetica (o default não muda o que já era impresso)", () => {
    expect(pageTokensToPdf().fontFamily).toBe("Helvetica");
  });

  it("um override explícito continua vencendo o default nas duas superfícies", () => {
    const resolved = { fontFamily: "lexend", fontSize: 12, blockSpacing: 16 };
    expect(pageTokensToCss(resolved).fontFamily).toBe("'Lexend', sans-serif");
    expect(pageTokensToPdf(resolved).fontFamily).toBe("Lexend");
  });
});

describe("pageTokens — CSS vars por elemento (Formato)", () => {
  it("pageTokensToCss emite as CSS vars de todos os elementos quando definidos", () => {
    const css = pageTokensToCss({
      fontFamily: undefined,
      fontSize: 12,
      blockSpacing: 16,
      elementFontSizes: { stem: 14, instruction: 10, alternative: 12, caption: 9 },
    }) as Record<string, unknown>;
    expect(css["--doc-fs-stem"]).toBe("18.67px");    // 14 * 96/72
    expect(css["--doc-fs-instruction"]).toBe("13.33px"); // 10 * 96/72
    expect(css["--doc-fs-alternative"]).toBe("16px"); // 12 * 96/72
    expect(css["--doc-fs-caption"]).toBe("12px");     // 9 * 96/72
  });

  /**
   * As vars são SEMPRE emitidas, derivadas do tamanho base. Antes só existiam
   * quando o documento trazia `elementFontSizes` (que nenhuma UI escreve), então
   * a folha caía nos fallbacks do CSS e o PDF usava constantes absolutas — as
   * duas superfícies divergiam ao mudar o tamanho do texto.
   */
  it("pageTokensToCss deriva as CSS vars de elemento do tamanho base quando não há override", () => {
    const css = pageTokensToCss({ fontFamily: undefined, fontSize: 12, blockSpacing: 16 }) as Record<string, unknown>;
    expect(css["--doc-fs-stem"]).toBe("16px");        // 12pt
    expect(css["--doc-fs-instruction"]).toBe("14px"); // 10.5pt
    expect(css["--doc-fs-alternative"]).toBe("16px"); // 12pt
    expect(css["--doc-fs-caption"]).toBe("13.33px");  // 10pt
  });

  it("pageTokensToCss escala as CSS vars de elemento junto com o tamanho base", () => {
    const css = pageTokensToCss({ fontFamily: undefined, fontSize: 18, blockSpacing: 16 }) as Record<string, unknown>;
    expect(css["--doc-fs-stem"]).toBe("24px");        // 18pt
    expect(css["--doc-fs-instruction"]).toBe("21px"); // 15.75pt
  });

  it("pageTokensToCss aplica o override por chave e deriva o resto (elementFontSizes parcial)", () => {
    const css = pageTokensToCss({
      fontFamily: undefined,
      fontSize: 12,
      blockSpacing: 16,
      elementFontSizes: { stem: 14 },
    }) as Record<string, unknown>;
    expect(css["--doc-fs-stem"]).toBe("18.67px");     // override
    expect(css["--doc-fs-instruction"]).toBe("14px"); // derivado do base
    expect(css["--doc-fs-alternative"]).toBe("16px");
    expect(css["--doc-fs-caption"]).toBe("13.33px");
  });
});
