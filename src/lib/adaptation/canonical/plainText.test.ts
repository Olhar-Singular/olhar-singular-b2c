import { describe, it, expect } from "vitest";
import { documentToPlainText } from "./plainText";
import { renderDocument } from "@/components/adaptation/render/__fixtures__/renderDocument";
import type { CanonicalDocument } from "./schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

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

  it("renders inline math via its alt text", () => {
    const text = documentToPlainText(renderDocument);
    expect(text).toContain("a sobre b");
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

  it("renders scaffolding items and divider", () => {
    const text = documentToPlainText(renderDocument);
    expect(text).toContain("- Passo 1: leia o enunciado");
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

  it("auto-prefixes the first question with 1. and produces no answer lines for open", () => {
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
    expect(documentToPlainText(doc)).toBe("1. Explique.");
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
    expect(documentToPlainText(doc)).toBe("1a. Explique.");
  });

  it("renders an image caption when present", () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        { id: id(1), type: "image", src: "x.png", alt: "fig", caption: [{ type: "text", text: "Figura 1" }] },
      ],
    };
    expect(documentToPlainText(doc)).toBe("Figura 1");
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
    expect(documentToPlainText(doc)).toBe("Responda.");
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
    expect(documentToPlainText(doc)).toBe("1. 1. inner");
  });

  it("renders an image with no caption as an empty block", () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        { id: id(1), type: "image", src: "x.png", alt: "fig" },
        { id: id(2), type: "paragraph", content: [{ type: "text", text: "depois" }] },
      ],
    };
    expect(documentToPlainText(doc)).toBe("\n\ndepois");
  });
});
