import { describe, it, expect } from "vitest";
import { documentToPlainText } from "./plainText";
import { renderDocument } from "@/components/adaptation/render/__fixtures__/renderDocument";
import type { CanonicalDocument } from "./schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Mesma pauta textual do Word (`exportDocx`): 60 underscores por linha. */
const ANSWER_LINE = "_".repeat(60);
const openLines = (n: number) => Array.from({ length: n }, () => ANSWER_LINE).join("\n");

describe("documentToPlainText", () => {
  it("renders every block and answer kind without throwing", () => {
    const text = documentToPlainText(renderDocument);
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  it("includes heading and paragraph text", () => {
    const text = documentToPlainText(renderDocument);
    expect(text).toContain("Atividade de Frações");
    expect(text).toContain("Considere");
  });

  it("renders inline math as its LaTeX source, not the accessibility alt", () => {
    const text = documentToPlainText(renderDocument);
    expect(text).toContain("\\frac{a}{b}");
    expect(text).not.toContain("a sobre b");
  });

  it("renders blockMath as its LaTeX source, not the accessibility alt", () => {
    const text = documentToPlainText(renderDocument);
    expect(text).toContain("x^2 + y^2 = z^2");
    expect(text).not.toContain("teorema de Pit\u00e1goras");
  });

  it("prefixes numbered questions and labels multiple-choice alternatives", () => {
    const text = documentToPlainText(renderDocument);
    expect(text).toContain("1. Quanto é 1/2 + 1/4?");
    expect(text).toContain("a) 3/4");
    expect(text).toContain("Escolha a opção correta.");
  });

  it("renders true/false, checkbox, matching, ordering, fillBlank and table", () => {
    const text = documentToPlainText(renderDocument);
    expect(text).toContain("(  ) V  (  ) F 1/2 > 1/4");
    expect(text).toContain("[ ] Opção A");
    expect(text).toContain("Brasil <-> Brasília");
    expect(text).toContain("____ Segundo");
    expect(text).toContain("Termo | Valor");
  });

  // The "Copiar" button sits next to "Exportar PDF"/"Exportar Word" and is used
  // to paste the sheet into Word or an e-mail. Screen, PDF and Word all hide the
  // answer key on purpose (see PdfAnswer / AnswerView / exportDocx); the plain
  // text projection must hide it too, or one click hands the students the
  // gabarito.
  describe("hides the answer key (parity with screen/PDF/Word)", () => {
    it("does not reveal the true/false value", () => {
      const text = documentToPlainText(renderDocument);
      expect(text).not.toContain("( V )");
      expect(text).not.toContain("( F )");
    });

    it("does not reveal which checkbox items are checked", () => {
      const text = documentToPlainText(renderDocument);
      expect(text).not.toContain("[x]");
    });

    it("keeps ordering items in authored order (sorting them would BE the key)", () => {
      const text = documentToPlainText(renderDocument);
      // Fixture authors "Segundo" (position 2) before "Primeiro" (position 1).
      expect(text.indexOf("Segundo")).toBeLessThan(text.indexOf("Primeiro"));
      expect(text).not.toContain("1. Primeiro");
    });

    it("does not print the fillBlank answer key, alternatives or tips", () => {
      const text = documentToPlainText(renderDocument);
      expect(text).not.toContain("(1) 3/4");
      expect(text).not.toContain("0.75");
      expect(text).not.toContain("some os numeradores");
    });

    it("does not mark the correct multiple-choice alternative", () => {
      const text = documentToPlainText(renderDocument);
      expect(text).toContain("a) 3/4");
      expect(text).not.toContain("✔");
    });
  });

  it("numbers scaffolding steps like the screen and the PDF, and renders the divider", () => {
    const text = documentToPlainText(renderDocument);
    expect(text).toContain("1. Passo 1: leia o enunciado");
    expect(text).toContain("2. Passo 2: identifique os dados");
    expect(text).not.toContain("- Passo 1: leia o enunciado");
    expect(text).toContain("---");
  });

  it("renders blockMath via latex when no alt is present", () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [{ id: id(1), type: "blockMath", latex: "a+b" }],
    };
    expect(documentToPlainText(doc)).toBe("a+b");
  });

  it("renders inline math via latex when no alt is present", () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        { id: id(1), type: "paragraph", content: [{ type: "inlineMath", latex: "x^2" }] },
      ],
    };
    expect(documentToPlainText(doc)).toBe("x^2");
  });

  it("auto-prefixes the first question with 1. and rules 3 answer lines by default", () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        {
          id: id(1),
          type: "question",
          stem: [{ id: id(2), type: "paragraph", content: [{ type: "text", text: "Explique." }] }],
          answer: { kind: "open" },
        },
      ],
    };
    expect(documentToPlainText(doc)).toBe(`1. Explique.\n${openLines(3)}`);
  });

  // Screen (QuestionView), PDF (PdfQuestion) and Word (exportDocx) all resolve
  // the label as `customNumber ?? ordinal`. "Copiar" must not be the only
  // surface printing the sequential number over the teacher's own numbering.
  it("uses customNumber as the question label when the block carries one", () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        {
          id: id(1),
          type: "question",
          customNumber: "1a",
          stem: [{ id: id(2), type: "paragraph", content: [{ type: "text", text: "Explique." }] }],
          answer: { kind: "open" },
        },
      ],
    };
    expect(documentToPlainText(doc)).toBe(`1a. Explique.\n${openLines(3)}`);
  });

  it("marks the image before its caption, like Word (achado 0140)", () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        { id: id(1), type: "image", src: "x.png", alt: "fig", caption: [{ type: "text", text: "Figura 1" }] },
      ],
    };
    expect(documentToPlainText(doc)).toBe("[Imagem: fig]\nFigura 1");
  });

  it("renders a question with an empty stem (no prefix to apply)", () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        {
          id: id(1),
          type: "question",
          stem: [],
          instruction: [{ type: "text", text: "Responda." }],
          answer: { kind: "open" },
        },
      ],
    };
    expect(documentToPlainText(doc)).toBe(`Responda.\n${openLines(3)}`);
  });

  it("auto-numbers a question nested inside another question's stem", () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        {
          id: id(1),
          type: "question",
          stem: [
            {
              id: id(2),
              type: "question",
              stem: [{ id: id(3), type: "paragraph", content: [{ type: "text", text: "inner" }] }],
              answer: { kind: "open" },
            },
          ],
          answer: { kind: "open" },
        },
      ],
    };
    // Outer question is 1. ; the nested stem question restarts at 1. within the stem.
    expect(documentToPlainText(doc)).toBe(
      `1. 1. inner\n${openLines(3)}\n${openLines(3)}`,
    );
  });

  it("marks an image with no caption instead of dropping it (achado 0140)", () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        { id: id(1), type: "image", src: "x.png", alt: "fig" },
        { id: id(2), type: "paragraph", content: [{ type: "text", text: "depois" }] },
      ],
    };
    expect(documentToPlainText(doc)).toBe("[Imagem: fig]\n\ndepois");
  });

  // Mesma política do Word (exportDocx): sem `alt` (ou com `alt` só de espaços)
  // o marcador genérico ainda entra, para a legenda nunca ficar órfã.
  it("falls back to the bare [Imagem] marker when there is no alt (achado 0140)", () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        { id: id(1), type: "image", src: "x.png", alt: "   " },
        { id: id(2), type: "image", src: "y.png", alt: "", caption: [{ type: "text", text: "Figura 2" }] },
      ],
    };
    expect(documentToPlainText(doc)).toBe("[Imagem]\n\n[Imagem]\nFigura 2");
  });

  // Achado 0141: a pauta da questão aberta existe na tela (OpenAnswerView), no
  // PDF (PdfAnswer) e no Word (exportDocx) — só o "Copiar" a descartava, e o
  // professor colava no editor uma dissertativa sem onde responder. Quantas
  // linhas é decisão autoral (`answerLines`), então perder isso é perder dado.
  it("rules the authored number of answer lines for an open question (achado 0141)", () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        {
          id: id(1),
          type: "question",
          stem: [{ id: id(2), type: "paragraph", content: [{ type: "text", text: "Explique." }] }],
          instruction: [{ type: "text", text: "Responda nas linhas abaixo." }],
          answer: { kind: "open", answerLines: 4 },
        },
      ],
    };
    expect(documentToPlainText(doc)).toBe(
      `1. Explique.\nResponda nas linhas abaixo.\n${openLines(4)}`,
    );
  });

  // Mesmo default do Word e da tela (`answer.answerLines ?? 3`).
  it("falls back to 3 answer lines when answerLines is absent (achado 0141)", () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        {
          id: id(1),
          type: "question",
          stem: [{ id: id(2), type: "paragraph", content: [{ type: "text", text: "Explique." }] }],
          answer: { kind: "open" },
        },
      ],
    };
    expect(documentToPlainText(doc).split("\n").filter((l) => l === ANSWER_LINE)).toHaveLength(3);
  });
});

describe("documentToPlainText — cabeçalho e quebra de página (achado 0127)", () => {
  const doc: CanonicalDocument = {
    schemaVersion: 1,
    blocks: [
      { id: id(1), type: "paragraph", content: [{ type: "text", text: "corpo" }] },
      {
        id: id(2),
        type: "question",
        stem: [{ id: id(3), type: "paragraph", content: [{ type: "text", text: "q1" }] }],
        answer: { kind: "open" },
      },
      {
        id: id(4),
        type: "question",
        stem: [{ id: id(5), type: "paragraph", content: [{ type: "text", text: "q2" }] }],
        answer: { kind: "open" },
      },
    ],
  };

  it("prints the filled header fields above the document, date in BR format", () => {
    const text = documentToPlainText(doc, {
      header: {
        title: "Prova de Ciências",
        school: "Escola Municipal Teste",
        teacher: "Profa. Ana",
        date: "2026-08-18",
      },
    });
    expect(text.startsWith("Título: Prova de Ciências\n")).toBe(true);
    expect(text).toContain("Escola: Escola Municipal Teste");
    expect(text).toContain("Professor(a): Profa. Ana");
    expect(text).toContain("Data: 18/08/2026");
    expect(text).toContain("corpo");
  });

  it("omits empty header fields and emits nothing when the header is empty", () => {
    expect(documentToPlainText(doc, { header: { school: "  ", teacher: "Ana" } })).toContain(
      "Professor(a): Ana",
    );
    expect(documentToPlainText(doc, { header: { school: "  ", teacher: "Ana" } })).not.toContain(
      "Escola:",
    );
    expect(documentToPlainText(doc, { header: {} })).toBe(documentToPlainText(doc));
    expect(documentToPlainText(doc, {})).toBe(documentToPlainText(doc));
  });

  it("marks the page break before every question but the first when the switch is on", () => {
    const off = documentToPlainText(doc, { pageBreakPerQuestion: false });
    expect(off).not.toContain("QUEBRA DE PÁGINA");

    const on = documentToPlainText(doc, { pageBreakPerQuestion: true });
    expect(on.match(/QUEBRA DE PÁGINA/g)).toHaveLength(1);
    expect(on.indexOf("QUEBRA DE PÁGINA")).toBeGreaterThan(on.indexOf("q1"));
    expect(on.indexOf("QUEBRA DE PÁGINA")).toBeLessThan(on.indexOf("q2"));
  });
});
