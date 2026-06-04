import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { View } from "@react-pdf/renderer";
import { PdfBlock } from "./PdfBlock";
import { PdfAnswer } from "./PdfAnswer";
import { PdfQuestion } from "./PdfQuestion";
import { PdfImage, PdfScaffolding } from "./PdfLeafBlocks";
import { PdfMath } from "./PdfMath";
import type { Block, QuestionAnswer } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string) => [{ type: "text" as const, text: t }];

function walk(node: unknown, texts: string[]): void {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (typeof node === "string" || typeof node === "number") {
    texts.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((c) => walk(c, texts));
    return;
  }
  if (isValidElement(node)) {
    const el = node as ReactElement;
    if (typeof el.type === "function") {
      walk((el.type as (p: unknown) => unknown)(el.props), texts);
    }
    walk((el.props as { children?: unknown }).children, texts);
  }
}

function textOf(node: unknown): string {
  const t: string[] = [];
  walk(node, t);
  return t.join("");
}

describe("PdfAnswer", () => {
  it("marks the correct alternative with a check and letters the rest", () => {
    const answer: QuestionAnswer = {
      kind: "multipleChoice",
      alternatives: [
        { id: id(1), content: rt("wrong"), correct: false },
        { id: id(2), content: rt("right"), correct: true },
      ],
    };
    const txt = textOf(PdfAnswer({ answer }));
    expect(txt).toContain("a)");
    expect(txt).toContain("b)");
    expect(txt).toContain("✔");
  });

  it("renders (V)/(F) prefixes for trueFalse", () => {
    const txt = textOf(
      PdfAnswer({
        answer: {
          kind: "trueFalse",
          items: [
            { id: id(1), content: rt("t"), value: true },
            { id: id(2), content: rt("f"), value: false },
          ],
        },
      }),
    );
    expect(txt).toContain("(V)");
    expect(txt).toContain("(F)");
  });

  it("renders [x]/[ ] for checkbox", () => {
    const txt = textOf(
      PdfAnswer({
        answer: {
          kind: "checkbox",
          items: [
            { id: id(1), content: rt("y"), checked: true },
            { id: id(2), content: rt("n"), checked: false },
          ],
        },
      }),
    );
    expect(txt).toContain("[x]");
    expect(txt).toContain("[ ]");
  });

  it("renders matching pairs with a connector", () => {
    const txt = textOf(
      PdfAnswer({
        answer: { kind: "matching", pairs: [{ id: id(1), left: rt("BR"), right: rt("Brasília") }] },
      }),
    );
    expect(txt).toContain("BR");
    expect(txt).toContain("Brasília");
    expect(txt).toContain("↔");
  });

  it("sorts ordering items by position (the answer key)", () => {
    const txt = textOf(
      PdfAnswer({
        answer: {
          kind: "ordering",
          items: [
            { id: id(1), content: rt("Second"), position: 2 },
            { id: id(2), content: rt("First"), position: 1 },
          ],
        },
      }),
    );
    expect(txt.indexOf("First")).toBeLessThan(txt.indexOf("Second"));
    expect(txt).toContain("1.");
    expect(txt).toContain("2.");
  });

  it("renders fillBlank answers with alternatives and tip", () => {
    const txt = textOf(
      PdfAnswer({
        answer: {
          kind: "fillBlank",
          gaps: [
            { id: id(1), answer: "3/4", alternatives: ["0.75"], tip: "some" },
            { id: id(2), answer: "1" },
          ],
        },
      }),
    );
    expect(txt).toContain("3/4");
    expect(txt).toContain("também: 0.75");
    expect(txt).toContain("some");
    expect(txt).toContain("(1)");
    expect(txt).toContain("(2)");
  });

  it("renders a table header row and body rows", () => {
    const txt = textOf(
      PdfAnswer({
        answer: { kind: "table", rows: [[rt("Termo"), rt("Valor")], [rt("a"), rt("1")]] },
      }),
    );
    expect(txt).toContain("Termo");
    expect(txt).toContain("Valor");
    expect(txt).toContain("a");
    expect(txt).toContain("1");
  });

  it("renders the requested number of open answer lines", () => {
    const five = PdfAnswer({ answer: { kind: "open", answerLines: 5 } }) as ReactElement;
    expect((five.props.children as unknown[]).length).toBe(5);
    const def = PdfAnswer({ answer: { kind: "open" } }) as ReactElement;
    expect((def.props.children as unknown[]).length).toBe(3);
  });
});

describe("PdfBlock — page break", () => {
  it("wraps a block requesting pageBreakBefore in a break View", () => {
    const block: Block = {
      id: id(1),
      type: "paragraph",
      content: rt("x"),
      style: { pageBreakBefore: true },
    };
    const el = PdfBlock({ block }) as ReactElement;
    expect(el.type).toBe(View);
    expect((el.props as { break?: boolean }).break).toBe(true);
  });

  it("does not wrap when no page break is requested", () => {
    const block: Block = { id: id(1), type: "paragraph", content: rt("x") };
    const el = PdfBlock({ block }) as ReactElement;
    expect(el.type).not.toBe(View);
  });
});

describe("PdfQuestion — meta header", () => {
  it("omits the meta line when no number/points/difficulty", () => {
    const block: Extract<Block, { type: "question" }> = {
      id: id(1),
      type: "question",
      stem: [{ id: id(2), type: "paragraph", content: rt("s") }],
      answer: { kind: "open" },
    };
    const txt = textOf(PdfQuestion({ block }));
    expect(txt).toContain("s");
  });

  it("renders number, points, difficulty and instruction", () => {
    const block: Extract<Block, { type: "question" }> = {
      id: id(1),
      type: "question",
      number: 3,
      points: 2,
      difficulty: "dificil",
      stem: [{ id: id(2), type: "paragraph", content: rt("stem") }],
      instruction: rt("faça assim"),
      answer: { kind: "open" },
    };
    const txt = textOf(PdfQuestion({ block }));
    expect(txt).toContain("3.");
    expect(txt).toContain("(2 pts)");
    expect(txt).toContain("Difícil");
    expect(txt).toContain("faça assim");
  });
});

describe("PdfImage", () => {
  it("renders a caption when present and respects right alignment", () => {
    const block: Extract<Block, { type: "image" }> = {
      id: id(1),
      type: "image",
      src: "https://x/y.png",
      alt: "a",
      alignment: "right",
      width: 100,
      caption: rt("Figura 1"),
    };
    const el = PdfImage({ block }) as ReactElement;
    expect((el.props.style as { alignItems: string }).alignItems).toBe("flex-end");
    expect(textOf(el)).toContain("Figura 1");
  });

  it("defaults alignment to flex-start and omits the caption", () => {
    const block: Extract<Block, { type: "image" }> = {
      id: id(1),
      type: "image",
      src: "https://x/y.png",
      alt: "a",
    };
    const el = PdfImage({ block }) as ReactElement;
    expect((el.props.style as { alignItems: string }).alignItems).toBe("flex-start");
  });
});

describe("PdfScaffolding", () => {
  it("numbers each step", () => {
    const block: Extract<Block, { type: "scaffolding" }> = {
      id: id(1),
      type: "scaffolding",
      items: ["um", "dois"],
    };
    const txt = textOf(PdfScaffolding({ block }));
    expect(txt).toContain("1.");
    expect(txt).toContain("um");
    expect(txt).toContain("2.");
    expect(txt).toContain("dois");
  });
});

describe("PdfMath", () => {
  it("renders the latex source centered", () => {
    const block: Extract<Block, { type: "blockMath" }> = {
      id: id(1),
      type: "blockMath",
      latex: "E=mc^2",
    };
    const el = PdfMath({ block }) as ReactElement;
    expect((el.props.style as { textAlign: string }).textAlign).toBe("center");
    expect(textOf(el)).toContain("E=mc^2");
  });
});
