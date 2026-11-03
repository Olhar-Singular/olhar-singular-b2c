/**
 * Marcador do item de resposta na mesma linha de base do item (achado 0391).
 *
 * O marcador (`a)`, `( ) V ( ) F`, `____`) é um <Text> IRMÃO da coluna do item,
 * alinhado pelo topo. Quando o item abre com fórmula inline, o run de Courier
 * (maior que o corpo) aumenta a ascendente da primeira linha e a linha de base
 * do item desce ~4,5pt, enquanto o marcador fica onde estava. Mesmo defeito do
 * número da questão (0428), que lá foi resolvido levando o número para dentro do
 * <Text> do enunciado.
 *
 * O teste roda o layout real do react-pdf e compara a linha de base pintada
 * (topo da linha + ascendente) do marcador com a do item ao lado.
 */
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import { TRUE_FALSE_MARKER_TEXT } from "../pageTokens";
import type { CanonicalDocument, QuestionAnswer } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string) => [{ type: "text" as const, text: t }];
const math = (latex: string) => [{ type: "inlineMath" as const, latex }];

type Line = { string?: string; ascent?: number; box?: { x?: number; y?: number } };
type Node = { box?: { left?: number; top?: number }; lines?: Line[]; children?: Node[] };
type Painted = { text: string; left: number; baseline: number };

function paintedLines(node: Node, ox = 0, oy = 0, out: Painted[] = []): Painted[] {
  const left = ox + (node.box?.left ?? 0);
  const top = oy + (node.box?.top ?? 0);
  for (const line of node.lines ?? []) {
    out.push({
      text: (line.string ?? "").trim(),
      left: left + (line.box?.x ?? 0),
      baseline: top + (line.box?.y ?? 0) + (line.ascent ?? 0),
    });
  }
  for (const child of node.children ?? []) paintedLines(child, left, top, out);
  return out;
}

async function layout(answer: QuestionAnswer, fontSize = 12): Promise<Painted[]> {
  const document: CanonicalDocument = {
    schemaVersion: 1,
    blocks: [
      {
        id: id(1),
        type: "question",
        stem: [{ id: id(2), type: "paragraph", content: rt("Enunciado") }],
        answer,
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

const find = (lines: Painted[], text: string) => {
  const hit = lines.find((l) => l.text === text);
  expect(hit, `linha "${text}"`).toBeDefined();
  return hit!;
};

describe("PdfAnswer — marcador na linha de base do item com fórmula (achado 0391)", () => {
  for (const fontSize of [12, 24]) {
    it(`múltipla escolha a ${fontSize}pt: a) e b) assentam na linha do item`, async () => {
      const lines = await layout(
        {
          kind: "multipleChoice",
          alternatives: [
            { id: id(3), content: math("2/6"), correct: true },
            { id: id(4), content: rt("0,25"), correct: false },
          ],
        },
        fontSize,
      );
      expect(find(lines, "a)").baseline).toBeCloseTo(find(lines, "2/6").baseline, 2);
      expect(find(lines, "b)").baseline).toBeCloseTo(find(lines, "0,25").baseline, 2);
    });

    it(`ordenação a ${fontSize}pt: ____ na linha do item e coluna do item estável`, async () => {
      const lines = await layout(
        {
          kind: "ordering",
          items: [
            { id: id(3), content: rt("0,25"), position: 1 },
            { id: id(4), content: math("1/2"), position: 2 },
          ],
        },
        fontSize,
      );
      const markers = lines.filter((l) => l.text === "____");
      expect(markers).toHaveLength(2);
      const text = find(lines, "0,25");
      const formula = find(lines, "1/2");
      expect(markers[0]!.baseline).toBeCloseTo(text.baseline, 2);
      expect(markers[1]!.baseline).toBeCloseTo(formula.baseline, 2);
      // O ajuste não pode empurrar o item: as duas colunas começam no mesmo x.
      expect(formula.left).toBeCloseTo(text.left, 2);
    });
  }

  it("verdadeiro/falso: o marcador assenta na linha da afirmação com fórmula", async () => {
    const lines = await layout({
      kind: "trueFalse",
      items: [
        { id: id(3), content: math("3/4"), value: true },
        { id: id(4), content: rt("afirmacao"), value: false },
      ],
    });
    const markers = lines.filter((l) => l.text === TRUE_FALSE_MARKER_TEXT);
    expect(markers).toHaveLength(2);
    const formula = find(lines, "3/4");
    const text = find(lines, "afirmacao");
    expect(markers[0]!.baseline).toBeCloseTo(formula.baseline, 2);
    expect(markers[1]!.baseline).toBeCloseTo(text.baseline, 2);
    expect(formula.left).toBeCloseTo(text.left, 2);
  });
});
