import { describe, it, expect } from "vitest";
import {
  buildQuestionNode,
  buildImageNode,
  buildMathNode,
  buildScaffoldNode,
  buildDivider,
  emptyAnswer,
  type QuestionKind,
} from "./commands";
import { proseMirrorToCanonical } from "@/lib/adaptation/tiptap/toCanonical";

const gen = (() => {
  let n = 0;
  return () => {
    n += 1;
    const hex = n.toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${hex}`;
  };
})();

function wrapDoc(node: ReturnType<typeof buildMathNode>) {
  return { type: "doc", content: [node] };
}

describe("emptyAnswer", () => {
  const kinds: QuestionKind[] = [
    "open",
    "multipleChoice",
    "trueFalse",
    "checkbox",
    "matching",
    "ordering",
    "fillBlank",
    "table",
  ];

  it.each(kinds)("produces a valid %s answer", (kind) => {
    const answer = emptyAnswer(kind, gen);
    expect(answer.kind).toBe(kind);
  });

  it("multipleChoice has exactly one correct alternative", () => {
    const answer = emptyAnswer("multipleChoice", gen);
    if (answer.kind !== "multipleChoice") throw new Error("unexpected");
    expect(answer.alternatives.filter((a) => a.correct)).toHaveLength(1);
  });
});

describe("buildQuestionNode", () => {
  it("builds a question PM node whose round-trip is a valid canonical doc", () => {
    const node = buildQuestionNode("multipleChoice", gen);
    expect(node.type).toBe("question");
    const doc = proseMirrorToCanonical(wrapDoc(node));
    expect(doc.blocks[0].type).toBe("question");
  });

  it("seeds a paragraph stem so the question content is non-empty", () => {
    const node = buildQuestionNode("open", gen);
    expect(node.content?.[0].type).toBe("paragraph");
  });

  it("works for every question kind", () => {
    const kinds: QuestionKind[] = [
      "open",
      "multipleChoice",
      "trueFalse",
      "checkbox",
      "matching",
      "ordering",
      "fillBlank",
      "table",
    ];
    for (const kind of kinds) {
      const node = buildQuestionNode(kind, gen);
      expect(() => proseMirrorToCanonical(wrapDoc(node))).not.toThrow();
    }
  });
});

describe("buildImageNode", () => {
  it("builds an image PM node with provided src/alt", () => {
    const node = buildImageNode("data:image/png;base64,xxx", gen);
    expect(node.type).toBe("image");
    expect(node.attrs?.src).toBe("data:image/png;base64,xxx");
    const doc = proseMirrorToCanonical(wrapDoc(node));
    expect(doc.blocks[0].type).toBe("image");
  });
});

describe("buildMathNode", () => {
  it("builds a blockMath PM node with the given latex", () => {
    const node = buildMathNode("x^2", gen);
    expect(node.type).toBe("blockMath");
    expect(node.attrs?.latex).toBe("x^2");
    const doc = proseMirrorToCanonical(wrapDoc(node));
    expect(doc.blocks[0].type).toBe("blockMath");
  });

  it("defaults to a placeholder latex when omitted", () => {
    const node = buildMathNode(undefined, gen);
    expect(typeof node.attrs?.latex).toBe("string");
    expect((node.attrs?.latex as string).length).toBeGreaterThan(0);
  });
});

describe("buildScaffoldNode", () => {
  it("builds a scaffolding PM node with a starter item", () => {
    const node = buildScaffoldNode(gen);
    expect(node.type).toBe("scaffolding");
    expect(Array.isArray(node.attrs?.items)).toBe(true);
    const doc = proseMirrorToCanonical(wrapDoc(node));
    expect(doc.blocks[0].type).toBe("scaffolding");
  });
});

describe("buildDivider", () => {
  it("builds a divider PM node whose round-trip is a valid divider block", () => {
    const node = buildDivider(gen);
    expect(node.type).toBe("divider");
    const doc = proseMirrorToCanonical(wrapDoc(node));
    expect(doc.blocks[0].type).toBe("divider");
  });
});
