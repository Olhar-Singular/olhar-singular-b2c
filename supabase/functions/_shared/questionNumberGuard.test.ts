import { describe, it, expect } from "vitest";
import { stripQuestionNumbers } from "./questionNumberGuard";
import type { AdaptationResult } from "../../../src/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A question whose stem opens with `text`, plus an optional trailing inline. */
function result(text: string, extraInline?: { type: "text"; text: string }): AdaptationResult {
  return {
    schemaVersion: 1,
    document: {
      schemaVersion: 1,
      blocks: [
        {
          id: id(1),
          type: "question",
          stem: [
            {
              id: id(2),
              type: "paragraph",
              content: [{ type: "text", text }, ...(extraInline ? [extraInline] : [])],
            },
          ],
          answer: { kind: "open" },
        },
      ],
    },
    strategies_applied: [],
    pedagogical_justification: "x",
    implementation_tips: [],
  } as unknown as AdaptationResult;
}

const firstText = (r: AdaptationResult) => {
  const q = r.document.blocks[0] as { stem: Array<{ content: Array<{ text?: string }> }> };
  return q.stem[0].content[0].text;
};

describe("stripQuestionNumbers", () => {
  it("removes the ordinal we ourselves prepended in buildActivityText", () => {
    // Both activity builders emit `${i + 1}) ${q.text}` to give the model
    // question boundaries and order. The model reproduces that prefix
    // faithfully, and the renderer then numbers the question AGAIN from
    // document order — so the sheet showed "1. 1) O conceito de lugar".
    expect(firstText(stripQuestionNumbers(result("1) O conceito de lugar")))).toBe(
      "O conceito de lugar",
    );
  });

  it("handles the other ordinal punctuations a model may emit", () => {
    expect(firstText(stripQuestionNumbers(result("2. Assinale a opção")))).toBe("Assinale a opção");
    expect(firstText(stripQuestionNumbers(result("3 - Explique")))).toBe("Explique");
    expect(firstText(stripQuestionNumbers(result("10) Décima")))).toBe("Décima");
  });

  it("tolerates leading whitespace before the ordinal", () => {
    expect(firstText(stripQuestionNumbers(result("  4) Com espaço")))).toBe("Com espaço");
  });

  it("leaves a stem that never had an ordinal untouched", () => {
    expect(firstText(stripQuestionNumbers(result("O conceito de lugar")))).toBe(
      "O conceito de lugar",
    );
  });

  it("does not eat a number that is part of the question itself", () => {
    // No ordinal punctuation after the digits — this is content, not a label.
    expect(firstText(stripQuestionNumbers(result("5 maçãs custam quanto?")))).toBe(
      "5 maçãs custam quanto?",
    );
  });

  it("keeps the rest of the rich text intact", () => {
    const out = stripQuestionNumbers(result("1) O conceito de ", { type: "text", text: "lugar" }));
    const q = out.document.blocks[0] as { stem: Array<{ content: Array<{ text?: string }> }> };
    expect(q.stem[0].content[0].text).toBe("O conceito de ");
    expect(q.stem[0].content[1].text).toBe("lugar");
  });

  it("only touches the FIRST inline of the FIRST stem block", () => {
    // A "2)" appearing later is alternative text or content, never the label.
    const out = stripQuestionNumbers(result("1) Some ", { type: "text", text: "2) não é rótulo" }));
    const q = out.document.blocks[0] as { stem: Array<{ content: Array<{ text?: string }> }> };
    expect(q.stem[0].content[1].text).toBe("2) não é rótulo");
  });

  it("leaves non-question blocks alone", () => {
    const withHeading = {
      schemaVersion: 1,
      document: {
        schemaVersion: 1,
        blocks: [
          { id: id(1), type: "heading", level: 1, content: [{ type: "text", text: "1) Título" }] },
        ],
      },
      strategies_applied: [],
      pedagogical_justification: "x",
      implementation_tips: [],
    } as unknown as AdaptationResult;
    const out = stripQuestionNumbers(withHeading);
    const h = out.document.blocks[0] as { content: Array<{ text?: string }> };
    expect(h.content[0].text).toBe("1) Título");
  });

  it("survives a question whose stem is empty", () => {
    const empty = {
      schemaVersion: 1,
      document: {
        schemaVersion: 1,
        blocks: [{ id: id(1), type: "question", stem: [], answer: { kind: "open" } }],
      },
      strategies_applied: [],
      pedagogical_justification: "x",
      implementation_tips: [],
    } as unknown as AdaptationResult;
    expect(() => stripQuestionNumbers(empty)).not.toThrow();
  });

  it("survives a stem whose first block carries no inline content", () => {
    const imageFirst = {
      schemaVersion: 1,
      document: {
        schemaVersion: 1,
        blocks: [
          {
            id: id(1),
            type: "question",
            stem: [{ id: id(2), type: "image", src: "https://x/y.png", alt: "fig" }],
            answer: { kind: "open" },
          },
        ],
      },
      strategies_applied: [],
      pedagogical_justification: "x",
      implementation_tips: [],
    } as unknown as AdaptationResult;
    expect(() => stripQuestionNumbers(imageFirst)).not.toThrow();
  });

  it("leaves a stem that opens with a formula alone", () => {
    const mathFirst = {
      schemaVersion: 1,
      document: {
        schemaVersion: 1,
        blocks: [
          {
            id: id(1),
            type: "question",
            stem: [
              {
                id: id(2),
                type: "paragraph",
                content: [{ type: "inlineMath", latex: "x^2" }, { type: "text", text: " = 4" }],
              },
            ],
            answer: { kind: "open" },
          },
        ],
      },
      strategies_applied: [],
      pedagogical_justification: "x",
      implementation_tips: [],
    } as unknown as AdaptationResult;
    const out = stripQuestionNumbers(mathFirst);
    const q = out.document.blocks[0] as { stem: Array<{ content: Array<{ latex?: string }> }> };
    expect(q.stem[0].content[0].latex).toBe("x^2");
  });

  it("ignores a malformed text inline instead of throwing", () => {
    // Zod has already validated the model's output by the time this runs, so
    // a text node without `text` should be impossible — but this guard is the
    // last thing between the model and a document the teacher has paid for.
    const malformed = {
      schemaVersion: 1,
      document: {
        schemaVersion: 1,
        blocks: [
          {
            id: id(1),
            type: "question",
            stem: [{ id: id(2), type: "paragraph", content: [{ type: "text" }] }],
            answer: { kind: "open" },
          },
        ],
      },
      strategies_applied: [],
      pedagogical_justification: "x",
      implementation_tips: [],
    } as unknown as AdaptationResult;
    expect(() => stripQuestionNumbers(malformed)).not.toThrow();
  });

  it("does not blank a stem that is nothing but an ordinal", () => {
    // Removing everything would leave `text: ""`, which InlineText.min(1)
    // rejects — the document would stop reloading (the B8 class of bug).
    expect(firstText(stripQuestionNumbers(result("7)")))).toBe("7)");
  });
});

// C-14: the label regex ate the first operand of a sum ("9 - 4 = ___" became "4 = ___").
describe("stripQuestionNumbers never cuts a calculation (C-14)", () => {
  it.each([
    "9 - 4 = ___",
    "15 - 8 = ___",
    "7 + 6 = ___",
    "3 × 4 = ___",
    "20 ÷ 5 = ___",
    "12 − 5 = ___",
    "8 – 3 = ___",
    "100 - 1 =",
    "5 - 3 + 2 = ___",
    "2 x 3 = ___",
    "4 / 2 = ___",
    "5 . 3 = ___",
    "10 - 4 = ?",
    "15 - 8",
    "8 – 3",
    "3 - x = 5",
    // a single letter after the dash is a variable, not the first word of a title
    "3 - a",
    "12 - b?",
    "7 – x",
    "9 — 4 = ___",
    "5.3 = ___",
  ])("keeps %j as it is", (text) => {
    expect(firstText(stripQuestionNumbers(result(text)))).toBe(text);
  });

  it.each([
    ["1) 9 - 4 = ___", "9 - 4 = ___"],
    ["2. 5 + 3", "5 + 3"],
    ["10. 4 + 6", "4 + 6"],
    ["3) x + 2 = 5", "x + 2 = 5"],
    ["1 - Resolva a conta", "Resolva a conta"],
    ["4 – Explique o motivo", "Explique o motivo"],
    ["Questão 1: Calcule", "Calcule"],
    ["QUESTÃO 12 - Calcule", "Calcule"],
    ["Questão 3) Some", "Some"],
    ["questão 4. Some", "Some"],
    ["Q5) Some", "Some"],
  ])("still cleans the label of %j", (text, expected) => {
    expect(firstText(stripQuestionNumbers(result(text)))).toBe(expected);
  });

  it("does not blank a stem that is only a label", () => {
    expect(firstText(stripQuestionNumbers(result("Questão 1:")))).toBe("Questão 1:");
    expect(firstText(stripQuestionNumbers(result("1)")))).toBe("1)");
  });
});

// L7-3: a label is a label only when the shape says so. Content that merely starts like one stays.
describe("stripQuestionNumbers keeps content that looks like a label (L7-3)", () => {
  it.each([
    "Q1 = 5",
    "Q2 é a mediana",
    "q3 vale 10 pontos",
    "12 - cm",
    "7 - dois",
    "8 - kg",
    "9 - um",
    "2024. Foi o ano da lei",
    "1500. Foi descoberto",
    "3 - ab = 5",
    "3 - ab2",
    "3 - ab^2",
    "3 - ab(2)",
    "3 - ab_1",
    "3 - ab + 1",
    "3 - ab * 2",
    "3 - ab / 2",
    "3 - ab ÷ 2",
    "3 - ab × 2",
    "3 - ab < 2",
    "3 - ab > 2",
    "3 - ab - 2",
    "3 - ab − 2",
    "3 - ab – 2",
    "3 - ab — 2",
  ])("keeps %j as it is", (text) => {
    expect(firstText(stripQuestionNumbers(result(text)))).toBe(text);
  });

  it.each([
    ["Q1) Some", "Some"],
    ["Q1: Some", "Some"],
    ["Q1. Some", "Some"],
    ["Q1 - Explique", "Explique"],
    ["Questão 2 Explique", "Explique"],
    ["12. Some os valores", "Some os valores"],
    ["3 - Explique o motivo", "Explique o motivo"],
    ["3 - Dois amigos foram ao mercado", "Dois amigos foram ao mercado"],
    ["7 - Um tijolo pesa 2 kg", "Um tijolo pesa 2 kg"],
  ])("still cleans the label of %j", (text, expected) => {
    expect(firstText(stripQuestionNumbers(result(text)))).toBe(expected);
  });
});
