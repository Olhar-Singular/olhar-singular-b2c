/**
 * O marcador `____` da ordenação guarda o mesmo vão das duas telas, em qualquer
 * corpo (achado 0449).
 *
 * O bug: o `ordering` reusava a coluna calibrada para o glifo `a)`
 * (`alternativeMarkerColumnPt` — 22pt na base de 12pt, dos quais 6pt são vão).
 * O `____` da Helvetica avança 0,5em por `_`, ou seja 24pt na mesma base: mais
 * largo que a coluna INTEIRA. Com `flexShrink: 0` a caixa não cedia, o texto
 * transbordava para dentro da coluna do conteúdo e o papel imprimia
 * `____Evaporacao`, com o traço passando por baixo das primeiras letras — sem
 * fim visível para o aluno escrever o número. A prévia do Exportar e o Word
 * imprimem o mesmo marcador com folga. Como a coluna escala com o corpo mas a
 * proporção 24/22 não muda, o defeito valia em TODO tamanho de texto.
 *
 * Contrato: a distância do fim do `____` ao início do item é
 * `ALTERNATIVE_MARKER_GAP_PT` em todo tamanho de documento, e o marcador sai
 * numa linha só.
 */
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import { ALTERNATIVE_MARKER_GAP_PT } from "../pageTokens";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string) => [{ type: "text" as const, text: t }];
const ITEM = "Evaporacao";
const MARKER_TEXT = "____";

type Line = { string?: string; box?: { x?: number }; xAdvance?: number };
type Node = { box?: { left?: number }; lines?: Line[]; children?: Node[] };
type Painted = { text: string; left: number; right: number };

/** Linhas pintadas, com a posição ABSOLUTA de cada uma no papel. */
function paintedLines(node: Node, offset = 0, out: Painted[] = []): Painted[] {
  const left = offset + (node.box?.left ?? 0);
  for (const line of node.lines ?? []) {
    const x = left + (line.box?.x ?? 0);
    out.push({ text: line.string ?? "", left: x, right: x + (line.xAdvance ?? 0) });
  }
  for (const child of node.children ?? []) paintedLines(child, left, out);
  return out;
}

async function layout(fontSize: number): Promise<Painted[]> {
  const document: CanonicalDocument = {
    schemaVersion: 1,
    blocks: [
      {
        id: id(1),
        type: "question",
        stem: [{ id: id(2), type: "paragraph", content: rt("Enunciado") }],
        answer: {
          kind: "ordering",
          items: [{ id: id(3), content: rt(ITEM), position: 1 }],
        },
      },
    ],
  };
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document, pageStyle: { fontSize } }));
  const laidOut = (await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container.document,
    createPdfFontStore() as never,
  )) as Node;
  return paintedLines(laidOut);
}

describe("PdfAnswer — coluna do marcador da ordenação (achado 0449)", () => {
  for (const fontSize of [12, 24]) {
    it(`deixa ${ALTERNATIVE_MARKER_GAP_PT}pt entre o ____ e o item a ${fontSize}pt`, async () => {
      const lines = await layout(fontSize);
      const marker = lines.filter((l) => l.text === MARKER_TEXT);
      const item = lines.find((l) => l.text.startsWith(ITEM));

      expect(marker).toHaveLength(1);
      expect(item).toBeDefined();
      expect(item!.left - marker[0]!.right).toBeCloseTo(ALTERNATIVE_MARKER_GAP_PT, 2);
    });
  }
});
