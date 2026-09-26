/**
 * O cabeçalho da tabela se repete no topo de cada página (achado 0603).
 *
 * Quando a tabela atravessa a virada de folha, a página seguinte começava com
 * linhas de dados órfãs: quem vira a página não sabe mais o que cada coluna
 * significa. No `@react-pdf/renderer` só o que é `fixed` reaparece a cada
 * página (o rodapé do projeto já usa isso).
 *
 * O teste roda o layout real sobre uma tabela longa o bastante para atravessar
 * a página e cobra que TODA folha em que a tabela continua comece pelo
 * cabeçalho.
 */
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import type { CanonicalDocument, QuestionAnswer, RichText } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string): RichText => [{ type: "text", text: t }];

type Line = { string?: string };
type Node = {
  style?: { flexDirection?: string; borderRightWidth?: number; borderBottomWidth?: number };
  lines?: Line[];
  children?: Node[];
};

/** Texto pintado dentro da subárvore, concatenado. */
function paintedText(node: Node): string {
  return (
    (node.lines ?? []).map((l) => l.string ?? "").join("") +
    (node.children ?? []).map(paintedText).join(" ")
  );
}

const isCell = (node: Node) =>
  node.style?.borderRightWidth === 1 && node.style?.borderBottomWidth === 1;

/** Linhas de tabela desenhadas: uma `View` em linha cujos filhos são células. */
function tableRows(node: Node, out: Node[] = []): Node[] {
  const children = node.children ?? [];
  if (node.style?.flexDirection === "row" && children.length > 0 && children.every(isCell)) {
    out.push(node);
  }
  for (const child of children) tableRows(child, out);
  return out;
}

const HEADER = [rt("Substancia"), rt("Estado fisico"), rt("Densidade")];
const rows: RichText[][] = [HEADER];
for (let i = 1; i <= 40; i += 1) {
  rows.push([rt(`Substancia numero ${i}`), rt("Solido"), rt(String(100 + i))]);
}
const TABLE: QuestionAnswer = { kind: "table", rows };

async function layout(answer: QuestionAnswer): Promise<Node> {
  const doc: CanonicalDocument = {
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
  inst.updateContainer(AdaptationPdf({ document: doc }));
  return (await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container.document,
    createPdfFontStore() as never,
  )) as Node;
}

describe("PdfAnswer — cabeçalho da tabela repetido a cada página", () => {
  it("repete o cabeçalho no topo da página seguinte", async () => {
    const root = await layout(TABLE);
    const pages = root.children ?? [];
    expect(pages.length).toBeGreaterThanOrEqual(2);

    for (const page of pages) {
      const drawn = tableRows(page);
      if (drawn.length === 0) continue; // folha sem tabela
      const first = paintedText(drawn[0]);
      expect(first).toContain("Substancia");
      expect(first).toContain("Estado fisico");
      expect(first).toContain("Densidade");
    }
  });
});
