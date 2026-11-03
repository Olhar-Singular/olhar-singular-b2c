/**
 * O marcador V/F do papel guarda o mesmo vão das duas telas, em qualquer corpo
 * (achado 0359).
 *
 * O bug: a coluna do marcador era a constante `TF_MARKER = { width: 60 }`,
 * calibrada à mão contra um glifo que mede 58,008pt na base de 12pt. Sobravam
 * 1,99pt até a afirmação e o papel imprimia `(  ) V  (  ) F A evaporacao…` como
 * uma frase só; acima do padrão do popover "Formato" o glifo passava dos 60pt e
 * era o marcador que quebrava, como no achado 0182.
 *
 * Contrato: a distância do fim do marcador ao início da afirmação é
 * `TRUE_FALSE_MARKER_GAP_PT` (o `gap-3` das duas telas) em todo tamanho de
 * documento, e o marcador sai numa linha só.
 */
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import { TRUE_FALSE_MARKER_GAP_PT, TRUE_FALSE_MARKER_TEXT } from "../pageTokens";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string) => [{ type: "text" as const, text: t }];
const STATEMENT = "Aevaporacao transforma agua em vapor";

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
    version: 1,
    blocks: [
      {
        id: id(1),
        type: "question",
        stem: [{ id: id(2), type: "paragraph", content: rt("Enunciado") }],
        answer: {
          kind: "trueFalse",
          items: [{ id: id(3), content: rt(STATEMENT), value: true }],
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

describe("PdfAnswer — coluna do marcador V/F (achado 0359)", () => {
  for (const fontSize of [12, 24]) {
    it(`deixa ${TRUE_FALSE_MARKER_GAP_PT}pt entre o marcador e a afirmação a ${fontSize}pt`, async () => {
      const lines = await layout(fontSize);
      const marker = lines.filter((l) => l.text === TRUE_FALSE_MARKER_TEXT);
      const statement = lines.find((l) => l.text.startsWith("Aevaporacao"));

      expect(marker).toHaveLength(1);
      expect(statement).toBeDefined();
      expect(statement!.left - marker[0]!.right).toBeCloseTo(TRUE_FALSE_MARKER_GAP_PT, 2);
    });
  }
});
