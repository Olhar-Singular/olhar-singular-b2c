/**
 * A linha da tabela não é partida pela virada de página (achado 0602).
 *
 * Cada célula desenha `borderRight`/`borderBottom`, então uma linha fatiada pelo
 * fim da folha deixa a moldura na página 1 e leva o texto inteiro para a página 2:
 * a folha termina numa caixa vazia, que o aluno lê como espaço para preencher.
 * Sem `wrap={false}` o padrão do react-pdf é quebrar a `View`.
 *
 * O teste roda o layout real do react-pdf sobre uma tabela longa o bastante para
 * atravessar a página e cobra que toda linha desenhada tenha texto dentro.
 */
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import FontStore from "@react-pdf/font";
import { AdaptationPdf } from "./AdaptationPdf";
import type { CanonicalDocument, QuestionAnswer, RichText } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string): RichText => [{ type: "text", text: t }];

type Node = {
  style?: { flexDirection?: string; borderRightWidth?: number; borderBottomWidth?: number };
  lines?: unknown[];
  children?: Node[];
};

/** Total de linhas de texto pintadas dentro da subárvore. */
function paintedLines(node: Node): number {
  return (
    (node.lines ?? []).length +
    (node.children ?? []).reduce((sum, child) => sum + paintedLines(child), 0)
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

const rows: RichText[][] = [[rt("Substancia"), rt("Estado"), rt("Fusao")]];
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
    new (FontStore as unknown as { new (): unknown })() as never,
  )) as Node;
}

describe("PdfAnswer — linha de tabela indivisível entre páginas", () => {
  it("não fatia a linha entre duas folhas", async () => {
    const root = await layout(TABLE);
    expect(root.children?.length ?? 0).toBeGreaterThanOrEqual(2);

    // A linha fatiada vira duas: um pedaço com parte das células no fim de uma
    // folha (a moldura vazia) e o resto no topo da seguinte.
    const drawn = tableRows(root);
    // `>=` e não `===`: o cabeçalho é `fixed` e reaparece em toda folha em que a
    // tabela continua (0603), então há uma linha desenhada a mais por página.
    expect(drawn.length).toBeGreaterThanOrEqual(rows.length);
    for (const row of drawn) {
      expect((row.children ?? []).length).toBe(rows[0].length);
      expect(paintedLines(row)).toBe(rows[0].length);
    }
  });
});
