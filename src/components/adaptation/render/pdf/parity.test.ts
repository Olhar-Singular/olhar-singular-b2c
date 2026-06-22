/**
 * Parity contract: every canonical Block.type and every QuestionAnswer.kind has
 * a PDF mapper (just like the screen renderer's BlockView / AnswerView). The
 * mappers are exhaustive switches with no default branch — TypeScript guarantees
 * exhaustiveness at compile time; these tests guarantee that, at runtime, no
 * node type falls through to a null/empty result.
 */

import { describe, it, expect } from "vitest";
import { PdfBlock } from "./PdfBlock";
import { PdfAnswer } from "./PdfAnswer";
import type { Block, QuestionAnswer } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string) => [{ type: "text" as const, text: t }];

const BLOCK_TYPES: Block["type"][] = [
  "heading",
  "paragraph",
  "blockMath",
  "image",
  "scaffolding",
  "divider",
  "question",
];

const ANSWER_KINDS: QuestionAnswer["kind"][] = [
  "open",
  "multipleChoice",
  "trueFalse",
  "checkbox",
  "matching",
  "ordering",
  "fillBlank",
  "table",
];

function sampleAnswer(kind: QuestionAnswer["kind"]): QuestionAnswer {
  switch (kind) {
    case "open":
      return { kind, answerLines: 2 };
    case "multipleChoice":
      return { kind, alternatives: [{ id: id(1), content: rt("a"), correct: true }] };
    case "trueFalse":
      return { kind, items: [{ id: id(1), content: rt("a"), value: true }] };
    case "checkbox":
      return { kind, items: [{ id: id(1), content: rt("a"), checked: false }] };
    case "matching":
      return { kind, pairs: [{ id: id(1), left: rt("a"), right: rt("b") }] };
    case "ordering":
      return { kind, items: [{ id: id(1), content: rt("a"), position: 1 }] };
    case "fillBlank":
      return { kind, gaps: [{ id: id(1), answer: "x" }] };
    case "table":
      return { kind, rows: [[rt("h")], [rt("c")]] };
  }
}

function sampleBlock(type: Block["type"]): Block {
  const base = { id: id(9) };
  switch (type) {
    case "heading":
      return { ...base, type, level: 1, content: rt("h") };
    case "paragraph":
      return { ...base, type, content: rt("p") };
    case "blockMath":
      return { ...base, type, latex: "x" };
    case "image":
      return { ...base, type, src: "https://x/y.png", alt: "alt" };
    case "scaffolding":
      return { ...base, type, items: ["step"] };
    case "divider":
      return { ...base, type };
    case "question":
      return {
        ...base,
        type,
        stem: [{ id: id(8), type: "paragraph", content: rt("stem") }],
        answer: sampleAnswer("open"),
      };
  }
}

describe("PDF parity contract", () => {
  it("maps every block type to a non-null element", () => {
    for (const type of BLOCK_TYPES) {
      const el = PdfBlock({ block: sampleBlock(type) });
      expect(el, `block "${type}" must have a mapper`).not.toBeNull();
      expect(el).toBeDefined();
    }
  });

  it("maps every answer kind to a non-null element", () => {
    for (const kind of ANSWER_KINDS) {
      const el = PdfAnswer({ answer: sampleAnswer(kind) });
      expect(el, `answer "${kind}" must have a mapper`).not.toBeNull();
      expect(el).toBeDefined();
    }
  });
});
