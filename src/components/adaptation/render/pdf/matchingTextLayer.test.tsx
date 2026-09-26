/**
 * matchingTextLayer (achado 0194): o elo da associação precisa existir na
 * CAMADA DE TEXTO do PDF, não só como tinta.
 *
 * O elo é DESENHADO desde o achado 0444 (um `Canvas`, para o traço valer em
 * qualquer família — Atkinson e Lexend não trazem o glifo `↔`). Só que `Canvas`
 * emite operadores de caminho e nenhum `Tj`: `pdftotext` devolvia `Peixe` e
 * `Rio` sem nada entre eles, e o leitor de tela sobre o PDF perdia o único
 * sinal de que os dois lados formam um par — justamente no arquivo que o
 * público deste produto mais manda para leitura assistida.
 *
 * O teste roda o LAYOUT REAL e lê os glifos que vão para a página, que é onde
 * a diferença entre "tinta" e "texto" aparece.
 */
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import type { CanonicalDocument, QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import type { FontFamilyToken } from "@/lib/adaptation/canonical/fontFamily";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string) => [{ type: "text" as const, text: t }];

type Glyph = { codePoints?: number[] };
type Run = { glyphs?: Glyph[] };
type Line = { runs?: Run[] };
type Node = { lines?: Line[]; children?: Node[] };

/** Todo texto que o layout vai pintar, glifo por glifo. */
function paintedText(node: Node): string {
  const own = (node.lines ?? [])
    .flatMap((line) => line.runs ?? [])
    .flatMap((run) => run.glyphs ?? [])
    .map((glyph) => String.fromCodePoint(...(glyph.codePoints ?? [])))
    .join("");
  return own + (node.children ?? []).map(paintedText).join("");
}

async function layout(answer: QuestionAnswer, fontFamily?: FontFamilyToken): Promise<Node> {
  const doc: CanonicalDocument = {
    schemaVersion: 1,
    ...(fontFamily ? { pageStyle: { fontFamily } } : {}),
    blocks: [
      {
        id: id(1),
        type: "question",
        stem: [{ id: id(2), type: "paragraph", content: rt("Relacione as colunas") }],
        answer,
      },
    ],
  };
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document: doc }));
  return (await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container.document,
    createPdfFontStore() as never,
  )) as Node;
}

const MATCHING: QuestionAnswer = {
  kind: "matching",
  pairs: [
    { id: id(3), left: rt("Peixe"), right: rt("Rio") },
    { id: id(4), left: rt("Camelo"), right: rt("Deserto") },
  ],
};

describe("PdfAnswer — elo da associação na camada de texto", () => {
  it("emite o separador entre o termo da esquerda e o da direita", async () => {
    const text = paintedText(await layout(MATCHING));

    expect(text).toContain("Peixe↔Rio");
    expect(text).toContain("Camelo↔Deserto");
  });

  it("emite o separador também quando a folha usa uma família sem o glifo", async () => {
    // Atkinson e Lexend não trazem U+2194: o caractere da camada de texto não
    // pode depender da família escolhida no popover Formato.
    const text = paintedText(await layout(MATCHING, "lexend"));

    expect(text).toContain("Peixe↔Rio");
  });
});
