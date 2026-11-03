/**
 * Título de seção nunca fecha uma folha (achado 0392).
 *
 * Sem regra de "manter com o próximo", o título que coube no pé da folha ficava
 * lá e o bloco que ele encabeça abria a folha seguinte. O teste empurra o título
 * para o pé da folha (preenchimento calibrado) e roda o layout real do
 * react-pdf: a folha que pinta o título pinta também o começo do bloco seguinte.
 *
 * O bloco curto (2 linhas) é indivisível para o react-pdf (orphans/widows 2) e
 * desce se a caixa MAIS a margem de baixo não cabe (achado 0708): é a faixa em
 * que o título ficava órfão mesmo com o bloco seguinte "cabendo" pela caixa.
 */
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import type {
  CanonicalDocument,
  RichText,
} from "@/lib/adaptation/canonical/schema";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string): RichText => [{ type: "text", text: t }];

type Node = { lines?: { string?: string }[]; children?: Node[] };

const paintedText = (node: Node): string =>
  (node.lines ?? []).map((l) => l.string ?? "").join("") +
  (node.children ?? []).map(paintedText).join(" ");

const SHORT =
  "Desenhe a planta do canteiro com as medidas indicadas e explique cada escolha " +
  "que voce fez para organizar o espaco entre as plantas e os caminhos do jardim.";

// Longo o bastante para o react-pdf partir (orphans/widows 2 no <Text>).
const LONG = Array.from({ length: 4 }, () => SHORT).join(" ");

async function layout(filler: number, next: string): Promise<Node> {
  const blocks: CanonicalDocument["blocks"] = [];
  for (let i = 0; i < filler; i += 1) {
    blocks.push({
      id: id(100 + i),
      type: "paragraph",
      content: rt(`Linha de preenchimento ${i}`),
    });
  }
  blocks.push({
    id: id(1),
    type: "heading",
    level: 2,
    content: rt("Missao Dois Arquiteto"),
  });
  blocks.push({ id: id(2), type: "paragraph", content: rt(next) });
  // O documento continua depois do bloco (o caso real: Missão 2, depois Missão 3).
  blocks.push({ id: id(3), type: "paragraph", content: rt("Fim da missao.") });
  const doc: CanonicalDocument = { schemaVersion: 1, blocks };
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document: doc }));
  return (await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container
      .document,
    createPdfFontStore() as never,
  )) as Node;
}

describe("PdfHeading — título não fica órfão no pé da folha", () => {
  // Faixa em que o título cai no pé da folha 1 com cada vez menos sobra.
  for (const [label, next] of [
    ["curto", SHORT],
    ["longo", LONG],
  ] as const)
    for (let filler = 22; filler <= 30; filler += 1) {
      it(`leva o começo do bloco ${label} junto (${filler} parágrafos antes)`, async () => {
        const root = await layout(filler, next);
        const pages = (root.children ?? []).map(paintedText);
        const withHeading = pages.findIndex((t) =>
          t.includes("Missao Dois Arquiteto"),
        );
        expect(withHeading).toBeGreaterThanOrEqual(0);
        expect(pages[withHeading]).toContain("Desenhe a planta");
      });
    }
});
