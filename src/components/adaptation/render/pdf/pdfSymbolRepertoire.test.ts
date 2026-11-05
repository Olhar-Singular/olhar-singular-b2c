// @vitest-environment node
/**
 * pdfSymbolRepertoire.test.ts — o repertório que o aviso do Exportar declara é
 * EXATAMENTE o que o arquivo de fonte de símbolos desenha.
 *
 * `pdfSymbolRepertoire.ts` é gerado por `scripts/build-symbol-fonts.py` a partir
 * do cmap do `.ttf`. Se alguém trocar a fonte (ou editar o arquivo) sem rodar o
 * script, o aviso passaria a prometer glifo que não existe (silêncio) ou a
 * reclamar de glifo que existe (falso alarme). O teste lê o cmap pelo fontkit
 * real do react-pdf, sem mock.
 */
import { describe, it, expect } from "vitest";
import { createPdfFontStore } from "@/test/pdfFontStore";
import symbols from "@/test/mathSymbols.json";
import { PDF_SYMBOL_RANGES } from "./pdfSymbolRepertoire";
import { SYMBOL_FONT_FAMILY, SYMBOL_MONO_FONT_FAMILY } from "./fontStack";

type FontLike = { characterSet: number[]; hasGlyphForCodePoint: (cp: number) => boolean };

async function loadFont(family: string): Promise<FontLike> {
  const store = createPdfFontStore() as unknown as {
    load: (d: { fontFamily: string; fontWeight: string; fontStyle: string }) => Promise<void>;
    getFont: (d: { fontFamily: string; fontWeight: number; fontStyle: string }) => { data: FontLike };
  };
  await store.load({ fontFamily: family, fontWeight: "normal", fontStyle: "normal" });
  return store.getFont({ fontFamily: family, fontWeight: 400, fontStyle: "normal" }).data;
}

describe("repertório declarado x cmap do arquivo", () => {
  it("as faixas de `pdfSymbolRepertoire.ts` são o cmap exato de DejaVuSans-Symbols.ttf", async () => {
    const font = await loadFont(SYMBOL_FONT_FAMILY);
    const declared = new Set(PDF_SYMBOL_RANGES.flatMap(([lo, hi]) =>
      Array.from({ length: hi - lo + 1 }, (_, i) => lo + i),
    ));
    // 0xFFFF é o segmento terminador do cmap formato 4, que o fontkit lista como caractere.
    const real = new Set(font.characterSet.filter((cp) => cp >= 0x20 && cp < 0xffff));
    expect([...declared].filter((cp) => !real.has(cp))).toEqual([]);
    expect([...real].filter((cp) => !declared.has(cp))).toEqual([]);
  });

  it("as faixas estão em ordem e sem sobreposição (a busca do aviso depende disso)", () => {
    PDF_SYMBOL_RANGES.forEach(([lo, hi], i) => {
      expect(lo).toBeLessThanOrEqual(hi);
      if (i > 0) expect(lo).toBeGreaterThan(PDF_SYMBOL_RANGES[i - 1][1] + 1);
    });
  });

  it("a monoespaçada cobre todo símbolo exigido, menos o ∥ (que a pilha da fórmula manda à proporcional)", async () => {
    const mono = await loadFont(SYMBOL_MONO_FONT_FAMILY);
    const missing = symbols.required.filter((ch) => !mono.hasGlyphForCodePoint(ch.codePointAt(0) as number));
    expect(missing).toEqual(["\u2225"]);
  });
});
