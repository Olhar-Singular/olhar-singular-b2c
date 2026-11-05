// @vitest-environment node
/**
 * greekHomoglyph.test.tsx — guarda do achado A1 (lote 4b): um texto com letra grega
 * que se parece com uma latina (ο Α Ε Ν Ο Τ) NÃO pode fazer a letra latina sumir do
 * texto extraído de um PDF gerado depois, no mesmo processo (a professora exporta
 * vários PDFs por sessão).
 *
 * Causa (provada, não a hipótese da Lupa): em `LiberationSans/Serif` o `Α` é um glifo
 * COMPOSTO que contém o `A` (idem Ε Ν Ο Τ ο). O fontkit guarda o primeiro objeto de
 * glifo de cada id; o componente nasce sem code point, e o `A` latino pintado depois
 * sai do arquivo sem entrada no ToUnicode (o papel sai certo, o texto copiado não).
 * O repertório grego sai do subset da Liberation: quem cobre o grego é a DejaVu, sem
 * glifo composto.
 *
 * O grego era só o caso mais visível: TODO glifo composto da Liberation faz o mesmo
 * (`á é ç ã õ` contêm `a e c o`). Um texto em português com acento exportado primeiro
 * apagava `E s c o T N A E I O U` do PDF seguinte. Por isso `build-classic-fonts.py`
 * também decompõe os compostos em contornos simples, e os testes de acento abaixo
 * guardam isso em toda família (a correção é no arquivo da fonte, não no render).
 *
 * Este arquivo roda em processo próprio: o primeiro teste NÃO pode ter nenhum render
 * latino antes dele.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Font, renderToBuffer } from "@react-pdf/renderer";
import symbols from "@/test/mathSymbols.json";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { AdaptationPdf } from "./AdaptationPdf";
import { PDF_FONT_REGISTRATIONS, hyphenateWord } from "./registerFonts";

vi.setConfig({ testTimeout: 60_000 });

const REQUIRED: string[] = symbols.required;
const GREEK_LOOKALIKES = "ο Α Ε Ν Ο Τ";
const LATIN_LINE = "Escreva Por Teste Nome";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function doc(lines: string[]): CanonicalDocument {
  return {
    schemaVersion: 1,
    blocks: lines.map((text, i) => ({
      id: id(i + 1),
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  } as CanonicalDocument;
}

const poppler = spawnSync("pdftotext", ["-v"]).error === undefined;

async function extract(lines: string[], token: string): Promise<string> {
  const buffer = await renderToBuffer(
    AdaptationPdf({ document: doc(lines), pageStyle: { fontFamily: token } as never }),
  );
  return spawnSync("pdftotext", ["-raw", "-enc", "UTF-8", "-", "-"], { input: buffer, encoding: "utf8" })
    .stdout;
}

const ACCENTED = "ÁÉÍÓÚ áéíóú ãõ âêô ç ÀÈ üÜ ñ Ã Õ Ç";
const ALL_FAMILIES = ["sans", "serif", "georgia", "arial", "atkinson", "lexend", "opendyslexic", "mono"];
const GREEK_DOC = [GREEK_LOOKALIKES, ...REQUIRED.map((ch) => `a ${ch} b`)];

describe("A1: homoglifo grego não faz a letra latina sumir (mesmo processo)", () => {
  beforeAll(() => {
    for (const { family, fonts } of PDF_FONT_REGISTRATIONS) {
      Font.register({
        family,
        fonts: fonts.map((f) => ({ ...f, src: join(process.cwd(), "public", f.src) })),
      });
    }
    Font.registerHyphenationCallback(hyphenateWord);
  });

  // Ordem importa: o defeito só aparece quando o grego é o PRIMEIRO uso da fonte.
  it.each(["sans", "serif", "georgia", "arial"])(
    "%s: grego primeiro, depois o documento latino, sem perder letra",
    async (token) => {
      if (!poppler) return console.warn("pdftotext ausente: conferência PULADA");
      const greek = await extract(GREEK_DOC, token);
      expect(greek).toContain(GREEK_LOOKALIKES);
      const latin = await extract([LATIN_LINE], token);
      expect(latin).toContain(LATIN_LINE);
    },
  );

  it.each(["sans", "serif", "georgia", "arial"])(
    "%s: ordem inversa (latino, depois grego, depois latino de novo)",
    async (token) => {
      if (!poppler) return;
      expect(await extract([LATIN_LINE], token)).toContain(LATIN_LINE);
      expect(await extract(GREEK_DOC, token)).toContain(GREEK_LOOKALIKES);
      expect(await extract([LATIN_LINE], token)).toContain(LATIN_LINE);
    },
  );

  it("os 124 símbolos continuam no texto extraído depois do grego", async () => {
    if (!poppler) return;
    const text = await extract(GREEK_DOC, "sans");
    expect(REQUIRED.filter((ch) => !text.includes(`a ${ch} b`))).toEqual([]);
  });

  it.each(ALL_FAMILIES)(
    "%s: texto acentuado primeiro, depois o documento latino, sem perder letra",
    async (token) => {
      if (!poppler) return;
      // Só as letras contam: a OpenDyslexic é larga, parte a linha e o poppler põe espaço
      // entre letras muito afastadas ("T este"); o que o teste cobra é nenhuma letra faltar.
      const letters = async (lines: string[]) => (await extract(lines, token)).replace(/\s+/g, "");
      const strip = (s: string) => s.replace(/\s+/g, "");
      expect(await letters([ACCENTED])).toContain(strip(ACCENTED));
      expect(await letters([LATIN_LINE, "AEIOU aeiou ac"])).toContain(strip(`${LATIN_LINE}AEIOU aeiou ac`));
    },
  );

  it.each(["sans", "atkinson", "opendyslexic"])(
    "%s: acento decomposto (colado do macOS) sai como o caractere composto, no papel e no texto",
    async (token) => {
      if (!poppler) return;
      const decomposed = "e\u0301 a\u0303 c\u0327 o\u0302 u\u0308 A\u0301";
      const text = (await extract([decomposed], token)).replace(/\s+/g, "");
      expect(text).toContain("\u00e9\u00e3\u00e7\u00f4\u00fc\u00c1");
    },
  );
});
