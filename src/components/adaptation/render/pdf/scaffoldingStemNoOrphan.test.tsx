/**
 * O enunciado da questão não fica sozinho no pé da folha quando o APOIO que o
 * segue desce (achado 0530).
 *
 * A caixa do APOIO é indivisível (0177): quando ela não cabe no resto da folha,
 * o react-pdf a leva para a folha seguinte e deixava o número + enunciado
 * sozinhos no pé da anterior. O teste empurra a questão para o pé da folha
 * (preenchimento calibrado) e roda o layout real do react-pdf: a folha que
 * pinta o enunciado precisa pintar também o APOIO que vem logo depois dele.
 */
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import type { CanonicalDocument, RichText } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string): RichText => [{ type: "text", text: t }];

type Node = {
  props?: { minPresenceAhead?: number };
  lines?: { string?: string }[];
  children?: Node[];
};

const paintedText = (node: Node): string =>
  (node.lines ?? []).map((l) => l.string ?? "").join("") +
  " " +
  (node.children ?? []).map(paintedText).join(" ");

const STEM = "Qual fruta tem o maior preco por unidade";
const STEP = "Compare os precos da tabela";

type Lead = "paragraph" | "enunciado";

async function layout(
  filler: number,
  lead: Lead,
  stem = STEM,
  steps = 4,
  scaffoldingBreak = false,
): Promise<Node> {
  const blocks: CanonicalDocument["blocks"] = [];
  for (let i = 0; i < filler; i += 1) {
    blocks.push({ id: id(100 + i), type: "paragraph", content: rt(`Linha de preenchimento ${i}`) });
  }
  const scaffolding = {
    id: id(3),
    type: "scaffolding" as const,
    items: [STEP, ...Array.from({ length: steps - 1 }, (_, i) => `Passo seguinte ${i}`)],
    ...(scaffoldingBreak ? { style: { pageBreakBefore: true } } : {}),
  };
  blocks.push({
    id: id(1),
    type: "question",
    ...(lead === "enunciado"
      ? { enunciado: rt(stem), enunciadoPosition: "above" as const, stem: [scaffolding] }
      : { stem: [{ id: id(2), type: "paragraph" as const, content: rt(stem) }, scaffolding] }),
    answer: { kind: "open", answerLines: 2 },
  });
  const doc: CanonicalDocument = { schemaVersion: 1, blocks };
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document: doc }));
  return (await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container.document,
    createPdfFontStore() as never,
  )) as Node;
}

describe("PdfQuestion — enunciado viaja com o APOIO indivisível", () => {
  for (const lead of ["paragraph", "enunciado"] as Lead[]) {
    // Faixa de alturas em que o enunciado cabe no pé da folha e a caixa não.
    for (let filler = 18; filler <= 34; filler += 1) {
      it(`${lead}: a folha do enunciado também pinta o APOIO (${filler} parágrafos antes)`, async () => {
        const root = await layout(filler, lead);
        const pages = root.children ?? [];
        const stemPages = pages.filter((p) => paintedText(p).includes(STEM));
        expect(stemPages).toHaveLength(1);
        expect(paintedText(stemPages[0])).toContain(STEP);
      });
    }

    it(`${lead}: questão com APOIO no topo da folha não gera folha em branco`, async () => {
      const root = await layout(0, lead);
      expect(root.children).toHaveLength(1);
    });

    it(`${lead}: abertura + APOIO maiores que a folha não abrem com folha em branco`, async () => {
      // ~540pt de abertura + ~270pt de caixa: o grupo não cabe em folha nenhuma.
      const long = `${STEM} ${"palavra longa de enunciado ".repeat(110)}`;
      const root = await layout(0, lead, long, 12);
      const pages = root.children ?? [];
      expect(paintedText(pages[0])).toContain(STEM);
      expect(pages).toHaveLength(2);
    });
  }

  it("APOIO que pede quebra de página antes não é amarrado à abertura", async () => {
    // A quebra pedida pelo autor manda: o grupo só existe sem ela.
    const guards = (node: Node): number =>
      (node.props?.minPresenceAhead ? 1 : 0) +
      (node.children ?? []).reduce((sum, child) => sum + guards(child), 0);
    expect(guards(await layout(0, "paragraph"))).toBe(1);
    expect(guards(await layout(0, "paragraph", STEM, 4, true))).toBe(0);
  });
});
