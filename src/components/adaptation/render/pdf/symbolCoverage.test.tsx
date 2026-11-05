// @vitest-environment node
/**
 * symbolCoverage.test.tsx — guarda do achado C-01 (lote 4): nenhum símbolo de
 * matemática pode SUMIR nem VIRAR OUTRO no PDF, em nenhuma família que a
 * professora escolhe no Formato, nem na Courier da fórmula.
 *
 * Por que existia: as famílias não cobrem o repertório (Liberation falta 24 dos
 * 124 símbolos exigidos; Atkinson/Lexend, 110; OpenDyslexic, 22; Courier, todos
 * fora da CP1252). O `@react-pdf` sempre anexa a Helvetica Type 1 ao fim da
 * pilha de fontes, então o glifo ausente caía nela e o byte WinAnsi virava OUTRO
 * caractere (`≤` → `d`, `⊂` → `‚`, `√` → nada): "cos = √3/2" saía "cos = 3/2".
 *
 * Roda o LAYOUT REAL do react-pdf com as fontes REAIS de `public/fonts/` (sem
 * mock de fonte) e confere, glifo por glifo, que a fonte escolhida para cada
 * caractere TEM o glifo e que o id impresso é o dele: é o "mapa de glifos". Em
 * ambiente node, não jsdom: o jsdom corrompe o subset TrueType e dá falso
 * negativo (memória pdf-font-corruption-diagnosis). O texto extraído do arquivo
 * pronto (poppler) é conferido mais abaixo quando o `pdftotext` existe; o smoke
 * `scripts/pdf-font-smoke.mjs` o exige no CI.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Font, pdf, renderToBuffer } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import symbols from "@/test/mathSymbols.json";
import { FONT_FAMILY_TOKENS } from "@/lib/adaptation/canonical/fontFamily";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { AdaptationPdf } from "./AdaptationPdf";
import { PDF_FONT_REGISTRATIONS, hyphenateWord } from "./registerFonts";

// Layout real de 124 símbolos x 7 famílias: sob a carga da suíte com coverage passa de 5 s.
vi.setConfig({ testTimeout: 60_000 });

const REQUIRED: string[] = symbols.required;
const EXTENDED: string[] = symbols.extended;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Form = "text" | "inline" | "block";
type Marks = ("bold" | "italic")[];

function documentWith(chars: string[], form: Form, marks?: Marks): CanonicalDocument {
  const blocks: CanonicalDocument["blocks"] = [];
  chars.forEach((ch, i) => {
    if (form === "text") {
      blocks.push({
        id: id(i + 1),
        type: "paragraph",
        content: [{ type: "text", text: `a ${ch} b`, ...(marks ? { marks } : {}) }],
      });
    } else if (form === "inline") {
      blocks.push({
        id: id(i + 1),
        type: "paragraph",
        content: [{ type: "text", text: "x " }, { type: "inlineMath", latex: `a ${ch} b` }],
      });
    } else {
      blocks.push({ id: id(i + 1), type: "blockMath", latex: `a ${ch} b` });
    }
  });
  return { schemaVersion: 1, blocks } as CanonicalDocument;
}

type FontLike = {
  hasGlyphForCodePoint: (cp: number) => boolean;
  glyphForCodePoint?: (cp: number) => { id: number };
  fullName?: string;
  constructor: { name: string };
};
type Glyph = { id: number; codePoints?: number[] };
type Run = { glyphs?: Glyph[]; attributes: { font?: FontLike[] } };
type Node = { lines?: { runs?: Run[] }[]; children?: Node[] };

async function layout(document: CanonicalDocument, token: string): Promise<Node> {
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document, pageStyle: { fontFamily: token } as never }));
  return (await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container.document,
    createPdfFontStore() as never,
  )) as Node;
}

/** Todo glifo pintado com a fonte que o pintou: quem não tem o glifo é defeito. */
function paintedGlyphs(node: Node): { ch: string; font: FontLike; glyph: Glyph }[] {
  const own = (node.lines ?? [])
    .flatMap((line) => line.runs ?? [])
    .flatMap((run) =>
      (run.glyphs ?? []).map((glyph) => ({
        ch: String.fromCodePoint(...(glyph.codePoints ?? [0x20])),
        font: run.attributes.font?.[0] as FontLike,
        glyph,
      })),
    );
  return own.concat((node.children ?? []).flatMap(paintedGlyphs));
}

/** Os que NÃO saem certos: a fonte escolhida não tem o glifo, ou o id impresso não é o dele. */
function wrongGlyphs(node: Node, wanted: Set<string>): string[] {
  return paintedGlyphs(node)
    .filter(({ ch }) => wanted.has(ch))
    .filter(({ ch, font, glyph }) => {
      const cp = ch.codePointAt(0) ?? 0;
      if (!font?.hasGlyphForCodePoint(cp)) return true;
      // TrueType: o id impresso precisa ser o do glifo da fonte (e nunca o .notdef).
      if (font.constructor.name !== "StandardFont") {
        return glyph.id === 0 || font.glyphForCodePoint?.(cp).id !== glyph.id;
      }
      return false;
    })
    .map(({ ch, font }) => `${ch}(U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase()}) em ${font?.fullName}`);
}

describe("C-01 — todo símbolo exigido sai com o glifo certo, em toda família e forma", () => {
  const forms: Form[] = ["text", "inline", "block"];

  for (const token of FONT_FAMILY_TOKENS) {
    for (const form of forms) {
      it(`${token} / ${form}: ${REQUIRED.length} símbolos`, async () => {
        const node = await layout(documentWith(REQUIRED, form), token);
        expect(wrongGlyphs(node, new Set(REQUIRED))).toEqual([]);
      });
    }
  }

  it("o conjunto estendido (variantes gregas, lógica, delimitadores) também sai certo na fórmula e no texto", async () => {
    for (const token of ["sans", "mono", "atkinson"] as const) {
      for (const form of ["text", "inline"] as const) {
        const node = await layout(documentWith(EXTENDED, form), token);
        expect(wrongGlyphs(node, new Set(EXTENDED)), `${token}/${form}`).toEqual([]);
      }
    }
  });

  it("negrito e itálico também resolvem o símbolo (sem 'Could not resolve font')", async () => {
    for (const token of ["sans", "serif", "atkinson", "lexend", "opendyslexic"] as const) {
      for (const marks of [["bold"], ["italic"], ["bold", "italic"]] as Marks[]) {
        const node = await layout(documentWith(REQUIRED, "text", marks), token);
        expect(wrongGlyphs(node, new Set(REQUIRED)), `${token}/${marks.join("+")}`).toEqual([]);
      }
    }
  });
});

describe("C-01 — no arquivo pronto", () => {
  // Registro global com caminho de DISCO (no browser são URLs de `public/`): a mesma lista
  // `PDF_FONT_REGISTRATIONS` que a app usa, só trocando o `src`.
  beforeAll(() => {
    for (const { family, fonts } of PDF_FONT_REGISTRATIONS) {
      Font.register({
        family,
        fonts: fonts.map((f) => ({ ...f, src: join(process.cwd(), "public", f.src) })),
      });
    }
    Font.registerHyphenationCallback(hyphenateWord);
  });
  const poppler = spawnSync("pdftotext", ["-v"]).error === undefined;

  // Este teste vem PRIMEIRO de propósito: o defeito só aparece quando a `sans` é a
  // primeira a usar a fonte de símbolos no processo (o fontkit guarda o glifo do
  // primeiro uso); qualquer render anterior com outra família o esconderia.
  it("o texto extraído não depende da ordem em que as famílias foram renderizadas no processo", async () => {
    if (!poppler) {
      console.warn("pdftotext ausente: conferência da ordem de render PULADA (o smoke do CI a exige)");
      return;
    }
    // A professora exporta mais de um PDF por sessão. A `sans` primeiro: ela usa o `∛`
    // (que contém o `√` como componente) e o `ₙ` (que contém o `ⁿ`) da fonte de símbolos;
    // as seguintes pintam `√` e `ⁿ` com a mesma fonte, e o fontkit guarda o glifo do
    // primeiro uso. Com glifo composto no arquivo, `√` e `ⁿ` sumiam do texto extraído.
    for (const token of ["sans", "atkinson", "lexend", "opendyslexic", "mono", "atkinson"]) {
      const buffer = await renderToBuffer(
        AdaptationPdf({
          document: documentWith(REQUIRED, "text"),
          pageStyle: { fontFamily: token } as never,
        }),
      );
      const text = spawnSync("pdftotext", ["-raw", "-enc", "UTF-8", "-", "-"], {
        input: buffer,
        encoding: "utf8",
      }).stdout;
      expect(
        REQUIRED.filter((ch) => !text.includes(`a ${ch} b`)),
        token,
      ).toEqual([]);
    }
  });

  it("a fonte de símbolos viaja DENTRO do PDF e o texto extraído confere", async () => {
    const buffer = await renderToBuffer(
      AdaptationPdf({
        document: documentWith(REQUIRED, "text"),
        pageStyle: { fontFamily: "atkinson" } as never,
      }),
    );
    // Nome da fonte embutida (subset "AAAAAA+Nome"): em objeto de dicionário, sem compressão.
    expect(buffer.toString("latin1")).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+DejaVuSans/);

    if (!poppler) {
      console.warn("pdftotext ausente: conferência do texto extraído PULADA (o smoke do CI a exige)");
      return;
    }
    const text = spawnSync("pdftotext", ["-raw", "-enc", "UTF-8", "-", "-"], {
      input: buffer,
      encoding: "utf8",
    }).stdout;
    const lost = REQUIRED.filter((ch) => !text.includes(`a ${ch} b`));
    expect(lost).toEqual([]);
  });
});
