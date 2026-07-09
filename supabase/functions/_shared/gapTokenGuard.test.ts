import { describe, it, expect } from "vitest";
import { normalizeGapTokens, stripGapTokens } from "./gapTokenGuard";
import type { AdaptationResult, Block, RichText } from "../../../src/lib/adaptation/canonical/schema";

const t = (text: string): RichText => [{ type: "text", text }];

function result(blocks: Block[]): AdaptationResult {
  return {
    schemaVersion: 1,
    document: { schemaVersion: 1, blocks },
    strategies_applied: [],
    pedagogical_justification: "",
    implementation_tips: [],
  };
}

describe("normalizeGapTokens", () => {
  it("rewrites {gapN} into a printable blank", () => {
    expect(normalizeGapTokens("Pirulit{gap1} que bat{gap2} bate")).toBe("Pirulit___ que bat___ bate");
  });

  it("is case-insensitive and accepts the pt-BR spelling", () => {
    expect(normalizeGapTokens("a{GAP1} b{Lacuna2} c{lacunas}")).toBe("a___ b___ c___");
  });

  it("accepts a token with no number, spaces, separators, or doubled braces", () => {
    expect(normalizeGapTokens("a{gap} b{ gap 3 } c{gap_4} d{{gap5}}")).toBe("a___ b___ c___ d___");
  });

  it("leaves text without tokens untouched", () => {
    expect(normalizeGapTokens("Pirulito que bate bate")).toBe("Pirulito que bate bate");
  });

  it("does not touch unrelated braces", () => {
    expect(normalizeGapTokens("conjunto {a, b} e {x1}")).toBe("conjunto {a, b} e {x1}");
  });
});

describe("stripGapTokens", () => {
  it("cleans heading and paragraph content", () => {
    const out = stripGapTokens(
      result([
        { id: "h", type: "heading", level: 1, content: t("T{gap1}") },
        { id: "p", type: "paragraph", content: t("P{gap2}") },
      ]),
    );
    expect(out.document.blocks[0]).toMatchObject({ content: t("T___") });
    expect(out.document.blocks[1]).toMatchObject({ content: t("P___") });
  });

  it("preserves inlineMath nodes and text marks", () => {
    const out = stripGapTokens(
      result([
        {
          id: "p",
          type: "paragraph",
          content: [
            { type: "text", text: "a{gap1}", marks: ["bold"] },
            { type: "inlineMath", latex: "x_{gap1}" },
          ],
        },
      ]),
    );
    expect(out.document.blocks[0]).toMatchObject({
      content: [
        { type: "text", text: "a___", marks: ["bold"] },
        { type: "inlineMath", latex: "x_{gap1}" },
      ],
    });
  });

  it("cleans an image caption and leaves a caption-less image alone", () => {
    const withCaption: Block = { id: "i1", type: "image", src: "https://x.co/a.png", alt: "a", caption: t("c{gap1}") };
    const bare: Block = { id: "i2", type: "image", src: "https://x.co/b.png", alt: "b" };
    const out = stripGapTokens(result([withCaption, bare]));
    expect(out.document.blocks[0]).toMatchObject({ caption: t("c___") });
    expect(out.document.blocks[1]).toEqual(bare);
  });

  it("cleans scaffolding items", () => {
    const out = stripGapTokens(result([{ id: "s", type: "scaffolding", items: ["passo{gap1}", "ok"] }]));
    expect(out.document.blocks[0]).toMatchObject({ items: ["passo___", "ok"] });
  });

  it("leaves blockMath and divider untouched", () => {
    const math: Block = { id: "m", type: "blockMath", latex: "a_{gap1}" };
    const div: Block = { id: "d", type: "divider" };
    const out = stripGapTokens(result([math, div]));
    expect(out.document.blocks[0]).toEqual(math);
    expect(out.document.blocks[1]).toEqual(div);
  });

  it("cleans the question stem recursively, plus enunciado and instruction", () => {
    const out = stripGapTokens(
      result([
        {
          id: "q",
          type: "question",
          stem: [{ id: "sp", type: "paragraph", content: t("S{gap1}") }],
          enunciado: t("E{gap2}"),
          instruction: t("I{gap3}"),
          answer: { kind: "open" },
        },
      ]),
    );
    expect(out.document.blocks[0]).toMatchObject({
      stem: [{ content: t("S___") }],
      enunciado: t("E___"),
      instruction: t("I___"),
      answer: { kind: "open" },
    });
  });

  it("leaves a question without enunciado/instruction without those keys", () => {
    const q: Block = {
      id: "q",
      type: "question",
      stem: [{ id: "sp", type: "paragraph", content: t("ok") }],
      answer: { kind: "open", answerLines: 3 },
    };
    const out = stripGapTokens(result([q]));
    expect(out.document.blocks[0]).toEqual(q);
  });

  it("cleans multipleChoice alternatives", () => {
    const out = stripGapTokens(
      result([
        {
          id: "q",
          type: "question",
          stem: [],
          answer: {
            kind: "multipleChoice",
            alternatives: [{ id: "a", content: t("A{gap1}"), correct: true }],
          },
        },
      ]),
    );
    expect(out.document.blocks[0]).toMatchObject({
      answer: { alternatives: [{ id: "a", content: t("A___"), correct: true }] },
    });
  });

  it("cleans trueFalse and checkbox items", () => {
    const out = stripGapTokens(
      result([
        { id: "q1", type: "question", stem: [], answer: { kind: "trueFalse", items: [{ id: "i", content: t("V{gap1}"), value: true }] } },
        { id: "q2", type: "question", stem: [], answer: { kind: "checkbox", items: [{ id: "i", content: t("C{gap1}"), checked: false }] } },
      ]),
    );
    expect(out.document.blocks[0]).toMatchObject({ answer: { items: [{ content: t("V___"), value: true }] } });
    expect(out.document.blocks[1]).toMatchObject({ answer: { items: [{ content: t("C___"), checked: false }] } });
  });

  it("cleans matching pairs and ordering items", () => {
    const out = stripGapTokens(
      result([
        { id: "q1", type: "question", stem: [], answer: { kind: "matching", pairs: [{ id: "p", left: t("L{gap1}"), right: t("R{gap2}") }] } },
        { id: "q2", type: "question", stem: [], answer: { kind: "ordering", items: [{ id: "i", content: t("O{gap1}"), position: 1 }] } },
      ]),
    );
    expect(out.document.blocks[0]).toMatchObject({ answer: { pairs: [{ left: t("L___"), right: t("R___") }] } });
    expect(out.document.blocks[1]).toMatchObject({ answer: { items: [{ content: t("O___"), position: 1 }] } });
  });

  it("cleans table cells", () => {
    const out = stripGapTokens(
      result([{ id: "q", type: "question", stem: [], answer: { kind: "table", rows: [[t("C{gap1}")]] } }]),
    );
    expect(out.document.blocks[0]).toMatchObject({ answer: { rows: [[t("C___")]] } });
  });

  it("cleans the fillBlank answer key, its alternatives and tip", () => {
    const out = stripGapTokens(
      result([
        {
          id: "q",
          type: "question",
          stem: [],
          answer: {
            kind: "fillBlank",
            gaps: [
              { id: "g1", answer: "o{gap1}", alternatives: ["x{gap2}"], tip: "d{gap3}" },
              { id: "g2", answer: "limpo" },
            ],
          },
        },
      ]),
    );
    expect(out.document.blocks[0]).toMatchObject({
      answer: {
        gaps: [
          { id: "g1", answer: "o___", alternatives: ["x___"], tip: "d___" },
          { id: "g2", answer: "limpo" },
        ],
      },
    });
  });

  it("preserves sibling fields of the result and the document", () => {
    const base = result([{ id: "p", type: "paragraph", content: t("ok") }]);
    const out = stripGapTokens({ ...base, strategies_applied: ["s"], pedagogical_justification: "j" });
    expect(out.strategies_applied).toEqual(["s"]);
    expect(out.pedagogical_justification).toBe("j");
    expect(out.document.schemaVersion).toBe(1);
  });
});
