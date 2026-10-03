/**
 * O enunciado da questão-tabela não fica sozinho no pé da folha (achado 0515).
 *
 * O guard do 0193 exige papel para o cabeçalho + uma linha ANTES da tabela, mas
 * mora dentro da resposta: quando ele empurra a tabela para a folha seguinte, o
 * número, o enunciado e a instrução da questão já foram colocados e ficam no pé
 * da folha anterior, uma ordem ("Complete a tabela") sem tabela.
 *
 * O teste empurra a questão para o pé da folha (preenchimento calibrado) e roda
 * o layout real do react-pdf: a folha que pinta o enunciado da questão-tabela
 * precisa pintar também o cabeçalho e uma linha de dados dela.
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

function tableRows(node: Node, out: Node[] = []): Node[] {
  const children = node.children ?? [];
  if (node.style?.flexDirection === "row" && children.length > 0 && children.every(isCell)) {
    out.push(node);
  }
  for (const child of children) tableRows(child, out);
  return out;
}

const paintedText = (node: Node): string =>
  (node.lines ?? []).map((l) => l.string ?? "").join("") +
  " " +
  (node.children ?? []).map(paintedText).join(" ");

async function layout(filler: number): Promise<Node> {
  const blocks: CanonicalDocument["blocks"] = [];
  for (let i = 0; i < filler; i += 1) {
    blocks.push({ id: id(100 + i), type: "paragraph", content: rt(`Linha de preenchimento ${i}`) });
  }
  blocks.push({
    id: id(1),
    type: "question",
    stem: [{ id: id(2), type: "paragraph", content: rt("Complete a tabela com as capitais") }],
    instruction: rt("Confira cada linha."),
    answer: {
      kind: "table",
      rows: [
        [rt("Estado"), rt("Capital"), rt("Regiao")],
        [rt("Acre"), rt("Rio Branco"), rt("Norte")],
        [rt("Bahia"), rt("Salvador"), rt("Nordeste")],
        [rt("Goias"), rt("Goiania"), rt("Centro-Oeste")],
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

describe("PdfQuestion — enunciado da questão-tabela viaja com a tabela", () => {
  // Faixa de alturas em que enunciado + instrução cabem na folha e o cabeçalho
  // + uma linha não: basta uma delas para o órfão aparecer.
  for (let filler = 18; filler <= 30; filler += 1) {
    it(`a folha do enunciado também pinta o cabeçalho e uma linha (${filler} parágrafos antes)`, async () => {
      const root = await layout(filler);
      const pages = root.children ?? [];
      const stemPages = pages.filter((p) => paintedText(p).includes("Complete a tabela"));
      expect(stemPages).toHaveLength(1);
      const drawn = tableRows(stemPages[0]);
      expect(drawn.length).toBeGreaterThanOrEqual(2);
      expect(paintedText(drawn[0])).toContain("Estado");
      // A instrução também não fica para trás.
      expect(paintedText(stemPages[0])).toContain("Confira cada linha.");
    });
  }

  it("questão-tabela no topo da folha não gera folha em branco", async () => {
    const root = await layout(0);
    expect(root.children).toHaveLength(1);
  });
});
