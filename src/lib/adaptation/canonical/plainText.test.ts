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
    expect(text).toContain("1) Quanto é 1/2 + 1/4?");
    expect(text).toContain("a) 3/4");
    expect(text).toContain("Escolha a opção correta.");
  });

  it("renders true/false, checkbox, matching, ordering, fillBlank and table", () => {
    const text = documentToPlainText(renderDocument);
    expect(text).toContain("( V ) 1/2 > 1/4");
    expect(text).toContain("[x] Opção A");
    expect(text).toContain("Brasil — Brasília");
    expect(text).toContain("1. Primeiro");
    expect(text).toContain("(1) 3/4");
    expect(text).toContain("Termo | Valor");
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

  it("auto-prefixes the first question with 1) and produces no answer lines for open", () => {
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
    expect(documentToPlainText(doc)).toBe("1) Explique.");
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
    // Outer question is 1) ; the nested stem question restarts at 1) within the stem.
    expect(documentToPlainText(doc)).toBe("1) 1) inner");
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
