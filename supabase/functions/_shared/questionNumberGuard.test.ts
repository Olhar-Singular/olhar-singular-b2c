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
