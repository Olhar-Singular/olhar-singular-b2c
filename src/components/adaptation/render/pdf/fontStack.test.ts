import { describe, it, expect } from "vitest";
import symbols from "@/test/mathSymbols.json";
import { FONT_FAMILY_TOKENS, fontFamilyToPdf } from "@/lib/adaptation/canonical/fontFamily";
import {
  MATH_FONT_FAMILY,
  SYMBOL_FONT_FAMILY,
  SYMBOL_MONO_FONT_FAMILY,
  isPdfPrintable,
  pdfFontStack,
} from "./fontStack";
import { PDF_FONT_REGISTRATIONS } from "./registerFonts";

describe("pdfFontStack (C-01)", () => {
  it("põe a fonte de símbolos logo depois da família, em toda família de texto", () => {
    expect(pdfFontStack("Liberation Sans")).toEqual(["Liberation Sans", "DejaVu Sans"]);
    expect(pdfFontStack("Atkinson Hyperlegible")).toEqual([
      "Atkinson Hyperlegible",
      "DejaVu Sans",
    ]);
  });

  it("a fórmula cai primeiro numa monoespaçada e, por último, na proporcional (∥)", () => {
    expect(pdfFontStack(MATH_FONT_FAMILY)).toEqual([
      "Courier",
      "DejaVu Sans Mono",
      "DejaVu Sans",
    ]);
  });

  it("toda família da pilha de todo token está registrada (ou é a Courier built-in)", () => {
    const registered = new Set(PDF_FONT_REGISTRATIONS.map((r) => r.family));
    for (const token of FONT_FAMILY_TOKENS) {
      for (const family of pdfFontStack(fontFamilyToPdf(token))) {
        expect(registered.has(family) || family === MATH_FONT_FAMILY, `${token}: ${family}`).toBe(
          true,
        );
      }
    }
    expect(registered.has(SYMBOL_FONT_FAMILY) && registered.has(SYMBOL_MONO_FONT_FAMILY)).toBe(true);
  });
});

describe("isPdfPrintable (C-01)", () => {
  it("aceita ASCII, acentos e todo símbolo exigido", () => {
    for (const ch of ["a", "Z", "~", " ", "é", "ç", "Ã", ...symbols.required, ...symbols.extended]) {
      expect(isPdfPrintable(ch.codePointAt(0) as number), ch).toBe(true);
    }
  });

  it("recusa o que nenhuma fonte do PDF desenha: dingbat, emoji, cirílico, CJK", () => {
    for (const ch of ["✏", "⚠", "☺", "😀", "Ж", "中"]) {
      expect(isPdfPrintable(ch.codePointAt(0) as number), ch).toBe(false);
    }
  });

  it("aceita os dingbats e símbolos que a fonte de símbolos ganhou no lote 4b", () => {
    for (const ch of [..."✓✔✕✖✗✘★☆♥♦♠♣⟵⟶⟷⟸⟹⟺⌀⩽⩾☐☑☒"]) {
      expect(isPdfPrintable(ch.codePointAt(0) as number), ch).toBe(true);
    }
  });

  it("recusa controle e o que fica entre os blocos", () => {
    expect(isPdfPrintable(0x07)).toBe(false);
    expect(isPdfPrintable(0x7f)).toBe(false);
    expect(isPdfPrintable(0x2600)).toBe(false);
  });
});
