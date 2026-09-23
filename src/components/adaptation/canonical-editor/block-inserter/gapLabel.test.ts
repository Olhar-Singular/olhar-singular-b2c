import { describe, it, expect } from "vitest";
import { Node as PMNode } from "@tiptap/pm/model";
import { getEditorSchema } from "@/lib/adaptation/tiptap/getEditorSchema";
import { canonicalToProseMirror } from "@/lib/adaptation/tiptap/fromCanonical";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { topLevelGaps } from "./topLevelGaps";
import { describeBlock, gapLabel } from "./gapLabel";

const schema = getEditorSchema();
const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function buildDoc(canonical: CanonicalDocument): PMNode {
  return PMNode.fromJSON(schema, canonicalToProseMirror(canonical));
}

/** Nomes de todos os "+" do documento, na ordem das lacunas. */
function labels(doc: PMNode): string[] {
  return topLevelGaps(doc).map((gap) => gapLabel(doc, gap));
}

const mixedDoc = buildDoc({
  schemaVersion: 1,
  blocks: [
    { id: uid(1), type: "heading", level: 1, content: [{ type: "text", text: "Atividade adaptada" }] },
    { id: uid(2), type: "paragraph", content: [{ type: "text", text: "Leia com atenção" }] },
    { id: uid(3), type: "divider" },
    {
      id: uid(4),
      type: "question",
      stem: [{ id: uid(5), type: "paragraph", content: [{ type: "text", text: "Quanto é 2 + 2?" }] }],
      answer: { kind: "open", expected: "4" },
    },
  ],
});

describe("describeBlock", () => {
  it("descreve por tipo, ordem no tipo e trecho do conteúdo", () => {
    expect(describeBlock(mixedDoc, 0)).toBe('título 1 "Atividade adaptada"');
    expect(describeBlock(mixedDoc, 1)).toBe('parágrafo 1 "Leia com atenção"');
    expect(describeBlock(mixedDoc, 3)).toBe('questão 1 "Quanto é 2 + 2?"');
  });

  it("usa só tipo e ordem quando o bloco não tem texto", () => {
    expect(describeBlock(mixedDoc, 2)).toBe("divisória 1");
  });

  it("numera dentro do tipo, não na posição do documento", () => {
    const doc = buildDoc({
      schemaVersion: 1,
      blocks: [
        { id: uid(1), type: "divider" },
        { id: uid(2), type: "paragraph", content: [] },
        { id: uid(3), type: "divider" },
        { id: uid(4), type: "paragraph", content: [] },
      ],
    });
    expect([0, 1, 2, 3].map((i) => describeBlock(doc, i))).toEqual([
      "divisória 1",
      "parágrafo 1",
      "divisória 2",
      "parágrafo 2",
    ]);
  });

  it("corta um texto longo em vez de ler o bloco inteiro", () => {
    const doc = buildDoc({
      schemaVersion: 1,
      blocks: [
        {
          id: uid(1),
          type: "paragraph",
          content: [{ type: "text", text: "Um enunciado bem comprido que não cabe num nome acessível" }],
        },
      ],
    });
    expect(describeBlock(doc, 0)).toBe('parágrafo 1 "Um enunciado bem comprido que não cabe n…"');
  });

  it("rotula os demais tipos de bloco de topo", () => {
    const doc = buildDoc({
      schemaVersion: 1,
      blocks: [
        { id: uid(1), type: "image", src: "https://x/y.png", alt: "" },
        { id: uid(2), type: "blockMath", latex: "x^2" },
        { id: uid(3), type: "scaffolding", items: ["casa"] },
      ],
    });
    expect([0, 1, 2].map((i) => describeBlock(doc, i))).toEqual([
      "imagem 1",
      "fórmula 1",
      "banco de palavras 1",
    ]);
  });
});

describe("gapLabel", () => {
  /*
    Achado 0220: os três "+" se chamavam todos "Inserir bloco" e ficavam fora da
    ordem do documento, então leitor de tela e teclado não tinham como saber
    onde cada inserção cai.
  */
  it("dá a cada lacuna um nome que diz onde a inserção cai", () => {
    expect(labels(mixedDoc)).toEqual([
      'Inserir bloco antes de título 1 "Atividade adaptada"',
      'Inserir bloco antes de parágrafo 1 "Leia com atenção"',
      "Inserir bloco antes de divisória 1",
      'Inserir bloco antes de questão 1 "Quanto é 2 + 2?"',
      'Inserir bloco após questão 1 "Quanto é 2 + 2?"',
    ]);
  });

  it("nunca repete um nome, mesmo com blocos de conteúdo idêntico", () => {
    const doc = buildDoc({
      schemaVersion: 1,
      blocks: [
        { id: uid(1), type: "paragraph", content: [] },
        { id: uid(2), type: "paragraph", content: [] },
        { id: uid(3), type: "paragraph", content: [] },
      ],
    });
    const names = labels(doc);
    expect(names).toHaveLength(4);
    expect(new Set(names).size).toBe(names.length);
  });
});
