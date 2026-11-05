/**
 * Fórmula vazia (ou só espaço) SOZINHA no campo não derruba o PDF (N-M-003).
 *
 * O pedaço da fórmula era emitido como `NO_HYPHEN_MARK + texto`. Com texto vazio sobrava um
 * <Text> cujo único conteúdo é o hífen condicional, que o textkit remove: um run sem glifo
 * nenhum, sem fonte, e o layout lê `unitsPerEm` de null (`TypeError`, nenhum PDF). Roda o
 * layout REAL nas oito superfícies de campo da questão, mais os blocos de folha.
 */
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import type { Block, CanonicalDocument, RichText } from "@/lib/adaptation/canonical/schema";

const id = (() => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
})();

type Node = { lines?: Array<{ string?: string }>; children?: Node[] };

async function layout(blocks: Block[]): Promise<Node> {
  const doc: CanonicalDocument = { schemaVersion: 1, blocks };
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document: doc }));
  return (await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container.document,
    createPdfFontStore() as never,
  )) as Node;
}

const allText = (node: Node): string =>
  (node.lines ?? []).map((l) => l.string ?? "").join("") + (node.children ?? []).map(allText).join("");

const math = (latex: string): RichText => [{ type: "inlineMath", latex }];
const text = (t: string): RichText => [{ type: "text", text: t }];
const stem = () => [{ id: id(), type: "paragraph", content: text("Q") }];
const question = (extra: object): Block =>
  ({ id: id(), type: "question", stem: stem(), answer: { kind: "open" }, ...extra }) as unknown as Block;

const EMPTY_LATEX: Array<[string, string]> = [
  ["vazio", ""],
  ["um espaço", " "],
  ["vários espaços", "   "],
  ["tabulação", "\t"],
  ["espaço inquebrável", "\u00a0"],
  ["quebra de linha", "\n"],
];

const SURFACES: Record<string, (m: RichText) => Block> = {
  enunciado: (m) => question({ enunciado: m }),
  instruction: (m) => question({ instruction: m }),
  alternativa: (m) =>
    question({ answer: { kind: "multipleChoice", alternatives: [{ id: id(), content: m, correct: true }] } }),
  verdadeiro_falso: (m) =>
    question({ answer: { kind: "trueFalse", items: [{ id: id(), content: m, value: true }] } }),
  caixa_de_selecao: (m) =>
    question({ answer: { kind: "checkbox", items: [{ id: id(), content: m, correct: true }] } }),
  pareamento_esquerda: (m) =>
    question({ answer: { kind: "matching", pairs: [{ id: id(), left: m, right: text("Par") }] } }),
  pareamento_direita: (m) =>
    question({ answer: { kind: "matching", pairs: [{ id: id(), left: text("Par"), right: m }] } }),
  ordenacao: (m) => question({ answer: { kind: "ordering", items: [{ id: id(), content: m }] } }),
  celula: (m) => question({ answer: { kind: "table", rows: [[m, text("B")], [text("C"), text("D")]] } }),
  paragrafo: (m) => ({ id: id(), type: "paragraph", content: m }) as unknown as Block,
  titulo: (m) => ({ id: id(), type: "heading", level: 2, content: m }) as unknown as Block,
};

describe("fórmula vazia sozinha no campo (N-M-003)", () => {
  for (const [surface, build] of Object.entries(SURFACES)) {
    for (const [label, latex] of EMPTY_LATEX) {
      it(`${surface}: ${label} gera o PDF`, async () => {
        await expect(layout([build(math(latex))])).resolves.toBeDefined();
      });
    }
  }

  // O mesmo padrão em qualquer <Text> cujo único conteúdo é caractere invisível (a busca do N-M-003).
  const INVISIBLE: Array<[string, string]> = [
    ["texto vazio", ""],
    ["hífen condicional", "\u00ad"],
    ["espaço de largura zero", "\u200b"],
    ["junção de largura zero", "\u200d"],
    ["junção de palavra", "\u2060"],
    ["marca de ordem de bytes", "\ufeff"],
  ];
  for (const [surface, build] of Object.entries(SURFACES)) {
    for (const [label, t] of INVISIBLE) {
      it(`${surface}: ${label} sozinho no campo gera o PDF`, async () => {
        await expect(layout([build([{ type: "text", text: t }])])).resolves.toBeDefined();
      });
    }
  }

  // Blocos de folha que imprimem string direto, sem passar pelo PdfRichText.
  const TINY_PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const LEAF: Record<string, Block> = {
    "fórmula em bloco vazia": { id: id(), type: "blockMath", latex: "" } as unknown as Block,
    "fórmula em bloco só de espaço": { id: id(), type: "blockMath", latex: "  " } as unknown as Block,
    "andaime com item vazio": { id: id(), type: "scaffolding", items: [""] } as unknown as Block,
    "andaime com item invisível": { id: id(), type: "scaffolding", items: ["\u200b"] } as unknown as Block,
    "legenda vazia": { id: id(), type: "image", src: TINY_PNG, alt: "f", caption: [] } as unknown as Block,
    "legenda só de fórmula vazia": {
      id: id(),
      type: "image",
      src: TINY_PNG,
      alt: "f",
      caption: math(" "),
    } as unknown as Block,
    "parágrafo sem runs": { id: id(), type: "paragraph", content: [] } as unknown as Block,
  };
  for (const [label, block] of Object.entries(LEAF)) {
    it(`${label} gera o PDF`, async () => {
      await expect(layout([block])).resolves.toBeDefined();
    });
  }

  it("a fórmula vazia não imprime nada além do resto do campo", async () => {
    const tree = await layout([SURFACES.alternativa(math(" "))]);
    expect(allText(tree).replace(/[\s\u00a0\u00ad]/g, "")).toBe("1.Qa)Página1de1");
  });

  it("uma fórmula vazia entre dois textos some sem derrubar o layout nem marcar o vazio", async () => {
    const mixed: RichText = [{ type: "text", text: "antes " }, { type: "inlineMath", latex: "" }, { type: "text", text: " depois" }];
    const tree = await layout([SURFACES.enunciado(mixed)]);
    expect(allText(tree)).toContain("antes");
    expect(allText(tree)).toContain("depois");
  });

  it("a fórmula com conteúdo continua saindo inteira", async () => {
    const tree = await layout([SURFACES.enunciado(math("x + 1"))]);
    expect(allText(tree).replace(/\u00a0/g, " ")).toContain("x + 1");
  });
});
