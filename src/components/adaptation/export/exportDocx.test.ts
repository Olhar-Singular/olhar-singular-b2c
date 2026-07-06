import { describe, it, expect } from "vitest";
import { TextRun } from "docx";
import {
  docxFileName,
  richTextToRuns,
  blockToDocxParagraphs,
  headerParagraphs,
} from "./exportDocx";
import type { Block, Inline } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const text = (t: string): Inline[] => [{ type: "text", text: t }];

describe("docxFileName", () => {
  it("retorna nome padrão quando o cabeçalho não tem título", () => {
    expect(docxFileName({})).toBe("atividade-adaptada.docx");
  });

  it("slugifica o título e adiciona .docx", () => {
    expect(docxFileName({ title: "Minha Prova Final" })).toBe("minha-prova-final.docx");
  });

  it("remove acentos do título", () => {
    expect(docxFileName({ title: "Atividade de Matemática" })).toBe("atividade-de-matematica.docx");
  });

  it("retorna nome padrão quando o título é só espaços", () => {
    expect(docxFileName({ title: "   " })).toBe("atividade-adaptada.docx");
  });

  it("retorna nome padrão quando o título só tem símbolos (slug vazio)", () => {
    expect(docxFileName({ title: "!!!" })).toBe("atividade-adaptada.docx");
  });
});

describe("richTextToRuns", () => {
  it("mapeia texto (com e sem marcas) e ignora nós não-texto", () => {
    const nodes: Inline[] = [
      { type: "text", text: "negrito", marks: ["bold", "italic", "underline"] },
      { type: "text", text: "limpo" },
      { type: "inlineMath", latex: "x^2" }, // ignorado (não é texto)
    ];
    const runs = richTextToRuns(nodes);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toBeInstanceOf(TextRun);
  });
});

describe("blockToDocxParagraphs", () => {
  it("heading nível 1 e nível 3 → 1 parágrafo cada", () => {
    expect(
      blockToDocxParagraphs({ id: id(1), type: "heading", level: 1, content: text("H1") }, 1),
    ).toHaveLength(1);
    expect(
      blockToDocxParagraphs({ id: id(2), type: "heading", level: 3, content: text("H3") }, 1),
    ).toHaveLength(1);
  });

  it("paragraph e divider → 1 parágrafo cada", () => {
    expect(
      blockToDocxParagraphs({ id: id(3), type: "paragraph", content: text("p") }, 1),
    ).toHaveLength(1);
    expect(blockToDocxParagraphs({ id: id(4), type: "divider" }, 1)).toHaveLength(1);
  });

  it("bloco não suportado (blockMath) → nenhum parágrafo", () => {
    expect(
      blockToDocxParagraphs({ id: id(5), type: "blockMath", latex: "x" }, 1),
    ).toHaveLength(0);
  });

  it("questão aberta usa answerLines e cai no default 3", () => {
    // stem + 2 linhas + spacer = 4
    expect(
      blockToDocxParagraphs(
        {
          id: id(6),
          type: "question",
          stem: [{ id: id(7), type: "paragraph", content: text("q") }],
          answer: { kind: "open", answerLines: 2 },
        },
        1,
      ),
    ).toHaveLength(4);
    // sem answerLines → default 3: stem + 3 linhas + spacer = 5
    expect(
      blockToDocxParagraphs(
        { id: id(8), type: "question", stem: [], answer: { kind: "open" } },
        1,
      ),
    ).toHaveLength(5);
  });

  it("múltipla escolha renderiza uma alternativa por opção (regressão: lia answer.choices inexistente)", () => {
    const mc = blockToDocxParagraphs(
      {
        id: id(9),
        type: "question",
        customNumber: "1a", // exercita o ramo customNumber ?? number
        stem: [
          { id: id(10), type: "paragraph", content: text("q") },
          { id: id(11), type: "divider" }, // stem não-paragraph → ignorado
        ],
        answer: {
          kind: "multipleChoice",
          alternatives: [
            { id: id(12), content: text("A"), correct: true },
            { id: id(13), content: text("B"), correct: false },
            { id: id(14), content: text("C"), correct: false },
          ],
        },
      },
      1,
    );
    // stem + 3 alternativas + spacer = 5 (antes do fix: stem + spacer = 2)
    expect(mc).toHaveLength(5);
  });

  it("verdadeiro/falso → stem + linha V/F + spacer", () => {
    expect(
      blockToDocxParagraphs(
        { id: id(15), type: "question", stem: [], answer: { kind: "trueFalse", items: [] } },
        3,
      ),
    ).toHaveLength(3);
  });

  it("tipo de resposta sem render dedicado (checkbox) → stem + spacer", () => {
    expect(
      blockToDocxParagraphs(
        { id: id(16), type: "question", stem: [], answer: { kind: "checkbox", items: [] } },
        1,
      ),
    ).toHaveLength(2);
  });
});

describe("headerParagraphs", () => {
  it("um parágrafo por campo preenchido", () => {
    expect(
      headerParagraphs({ title: "T", school: "E", teacher: "P", date: "D" }),
    ).toHaveLength(4);
  });

  it("cabeçalho vazio → nenhum parágrafo", () => {
    expect(headerParagraphs({})).toHaveLength(0);
  });
});
