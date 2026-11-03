/**
 * fontsEmbedded.test.ts — guarda do achado 0445: "o PDF exportado não embute
 * nenhuma fonte no caso padrão".
 *
 * As famílias clássicas (`sans`/`serif`/`arial`/`georgia`) mapeavam para os
 * built-ins Type 1 do `@react-pdf` (Helvetica / Times-Roman), que por definição
 * NÃO viajam dentro do arquivo (`pdffonts` → `emb: no`). Como
 * `pageStyle.fontFamily` nasce `undefined` e o default é o token `sans`, o caso
 * padrão era justamente o caso não embutido: a prova impressa na secretaria da
 * escola caía na fonte substituta do leitor, com métrica diferente, quebra de
 * linha diferente e paginação diferente da que a prévia prometeu.
 *
 * O teste fecha o buraco na origem: toda família que `fontFamilyToPdf` pode
 * devolver precisa ser uma família REGISTRADA por `registerPdfFonts` com um
 * arquivo `.ttf` que existe em `public/fonts/` — nunca um built-in.
 *
 * Exceção deliberada: `mono`. A fórmula do PDF é desenhada em Courier e a
 * compensação de caixa alta em `pageTokens.ts` (`mathScreen`/`mathPdf`, achados
 * 0424/0429) está calibrada na métrica do built-in. Trocar o arquivo mudaria a
 * tinta da fórmula, que é outro assunto e outra ficha.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { FONT_FAMILY_TOKENS, fontFamilyToPdf } from "@/lib/adaptation/canonical/fontFamily";
import { pageTokensToPdf } from "../pageTokens";

const mockRegister = vi.fn();
vi.mock("@react-pdf/renderer", () => ({
  Font: { register: mockRegister, registerHyphenationCallback: vi.fn() },
}));

/** Famílias built-in do `@react-pdf` (Type 1 padrão do PDF, jamais embutidas). */
const PDF_BUILTIN_FAMILIES = [
  "Courier",
  "Courier-Bold",
  "Courier-Oblique",
  "Courier-BoldOblique",
  "Helvetica",
  "Helvetica-Bold",
  "Helvetica-Oblique",
  "Helvetica-BoldOblique",
  "Times-Roman",
  "Times-Bold",
  "Times-Italic",
  "Times-BoldItalic",
  "Symbol",
  "ZapfDingbats",
];

/** Tokens que o documento pode usar no corpo do texto — todos menos `mono`. */
const TEXT_TOKENS = FONT_FAMILY_TOKENS.filter((t) => t !== "mono");

type RegisterCall = { family: string; fonts: { src: string }[] };

async function registeredFamilies(): Promise<RegisterCall[]> {
  mockRegister.mockClear();
  vi.resetModules();
  const { registerPdfFonts } = await import("./registerFonts");
  registerPdfFonts();
  return mockRegister.mock.calls.map((c) => c[0] as RegisterCall);
}

describe("fontes do PDF são embutidas no arquivo (0445)", () => {
  beforeEach(() => {
    mockRegister.mockClear();
  });

  it.each(TEXT_TOKENS)("o token %s não cai num built-in Type 1 do @react-pdf", (token) => {
    expect(PDF_BUILTIN_FAMILIES).not.toContain(fontFamilyToPdf(token));
  });

  it("a família padrão da folha (pageStyle sem fonte) também não é built-in", () => {
    expect(PDF_BUILTIN_FAMILIES).not.toContain(pageTokensToPdf().fontFamily);
  });

  it.each(TEXT_TOKENS)("a família do token %s é registrada com arquivo .ttf", async (token) => {
    const calls = await registeredFamilies();
    const family = fontFamilyToPdf(token);
    const call = calls.find((c) => c.family === family);
    expect(call, `nenhum Font.register para a família "${family}" (token ${token})`).toBeDefined();
    for (const f of call!.fonts) {
      const file = join(process.cwd(), "public", f.src.replace(/^\//, ""));
      expect(existsSync(file), `arquivo de fonte ausente: ${f.src}`).toBe(true);
    }
  });

  it("registra as quatro variantes peso × estilo de cada família clássica", async () => {
    const calls = await registeredFamilies();
    const classicas = [...new Set(["sans", "serif", "georgia", "arial"].map(fontFamilyToPdf))];
    for (const family of classicas) {
      const call = calls.find((c) => c.family === family);
      expect(call, `família "${family}" não registrada`).toBeDefined();
      expect(call!.fonts, `família "${family}" precisa das 4 variantes`).toHaveLength(4);
    }
  });
});
