/**
 * O cabeçalho da tabela nunca fica órfão no pé da página (achado 0193).
 *
 * O `fixed` que repete o cabeçalho a cada folha (0603) redesenha a linha em toda
 * página em que a tabela continua — inclusive numa folha onde SÓ o cabeçalho
 * coube e nenhuma linha de dados desceu junto. O professor imprime uma folha que
 * termina numa faixa de rótulos de coluna que não rotula nada, e a folha seguinte
 * repete a faixa.
 *
 * O teste empurra a tabela para o pé da folha (preenchimento calibrado) e roda o
 * layout real do react-pdf: toda folha que desenha o cabeçalho precisa desenhar
 * pelo menos uma linha de corpo embaixo dele.
 */
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import { RULE_WIDTH_PT } from "../pageTokens";
import type { CanonicalDocument, RichText } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string): RichText => [{ type: "text", text: t }];

type Node = {
  style?: { flexDirection?: string; borderRightWidth?: number; borderBottomWidth?: number };
  lines?: { string?: string }[];
  children?: Node[];
};

const isCell = (node: Node) =>
  node.style?.borderRightWidth === RULE_WIDTH_PT &&
  node.style?.borderBottomWidth === RULE_WIDTH_PT;

/** Linhas de tabela desenhadas: uma `View` em linha cujos filhos são células. */
function tableRows(node: Node, out: Node[] = []): Node[] {
  const children = node.children ?? [];
  if (node.style?.flexDirection === "row" && children.length > 0 && children.every(isCell)) {
    out.push(node);
  }
  for (const child of children) tableRows(child, out);
  return out;
}

/** Texto pintado dentro da subárvore, concatenado. */
const paintedText = (node: Node): string =>
  (node.lines ?? []).map((l) => l.string ?? "").join("") +
  (node.children ?? []).map(paintedText).join(" ");

/** Documento com `filler` parágrafos antes de uma questão com tabela curta. */
async function layout(filler: number): Promise<Node> {
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
    type: "question",
    stem: [{ id: id(2), type: "paragraph", content: rt("Enunciado") }],
    answer: {
      kind: "table",
      rows: [
        [rt("Substancia"), rt("Estado fisico"), rt("Temperatura de fusao")],
        [rt("Agua"), rt("Liquido"), rt("0")],
        [rt("Ferro"), rt("Solido"), rt("1538")],
        [rt("Oxigenio"), rt("Gasoso"), rt("-218")],
      ],
    },
  });
  const doc: CanonicalDocument = { schemaVersion: 1, blocks };
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document: doc }));
  return (await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container.document,
    createPdfFontStore() as never,
  )) as Node;
}

describe("PdfAnswer — cabeçalho da tabela não fica órfão na virada", () => {
  // A varredura cobre toda a faixa de alturas em que a tabela cai na virada:
  // basta uma folha em que só o cabeçalho caiba para o bug aparecer.
  for (let filler = 22; filler <= 27; filler += 1) {
    it(`mantém uma linha de dados junto do cabeçalho (${filler} parágrafos antes)`, async () => {
      const root = await layout(filler);
      for (const page of root.children ?? []) {
        const drawn = tableRows(page);
        if (drawn.length === 0) continue; // folha sem tabela
        expect(paintedText(drawn[0])).toContain("Substancia");
        // Cabeçalho sozinho na folha: a faixa de rótulos não rotula nada.
        expect(drawn.length).toBeGreaterThanOrEqual(2);
      }
    });
  }
});
