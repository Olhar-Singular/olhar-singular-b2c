import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { View, Text, Image } from "@react-pdf/renderer";
import { PdfBlock } from "./PdfBlock";
import { PdfAnswer } from "./PdfAnswer";
import { PdfQuestion } from "./PdfQuestion";
import { PdfHeading, PdfParagraph, PdfImage, PdfScaffolding } from "./PdfLeafBlocks";
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
  it("letters alternatives a)/b) without revealing the correct answer", () => {
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
    expect(txt).not.toContain("✔");
  });

  it("renders trueFalse without revealing the value — shows (  ) V and (  ) F markers", () => {
    const txt = textOf(
      PdfAnswer({
        answer: {
          kind: "trueFalse",
          items: [
            { id: id(1), content: rt("afirmação verdadeira"), value: true },
            { id: id(2), content: rt("afirmação falsa"), value: false },
          ],
        },
      }),
    );
    // The affirmation text must appear.
    expect(txt).toContain("afirmação verdadeira");
    expect(txt).toContain("afirmação falsa");
    // The empty V/F markers must be present.
    expect(txt).toContain("(  ) V");
    expect(txt).toContain("(  ) F");
    // Must NOT reveal the authored value.
    expect(txt).not.toContain("(V)");
    expect(txt).not.toContain("(F)");
  });

  it("renders checkbox with [ ] for all items — never reveals [x]", () => {
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
    expect(txt).toContain("[ ]");
    expect(txt).not.toContain("[x]");
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

  it("renders ordering items in array order without position sort or numbering", () => {
    const el = PdfAnswer({
      answer: {
        kind: "ordering",
        items: [
          { id: id(1), content: rt("Second"), position: 2 },
          { id: id(2), content: rt("First"), position: 1 },
        ],
      },
    }) as ReactElement;
    const txt = textOf(el);
    // Items appear in array order (Second before First — NOT sorted by position).
    expect(txt.indexOf("Second")).toBeLessThan(txt.indexOf("First"));
    // No positional numbering that would reveal the answer key.
    expect(txt).not.toContain("1.");
    expect(txt).not.toContain("2.");
    // Both texts are still present.
    expect(txt).toContain("Second");
    expect(txt).toContain("First");
  });

  it("renders fillBlank as an empty View — gaps live inline in the stem, no answer key", () => {
    const el = PdfAnswer({
      answer: {
        kind: "fillBlank",
        gaps: [
          { id: id(1), answer: "3/4", alternatives: ["0.75"], tip: "some" },
          { id: id(2), answer: "1" },
        ],
      },
    }) as ReactElement;
    // Must be non-null (parity contract); visually empty.
    expect(el).not.toBeNull();
    const txt = textOf(el);
    // Must NOT reveal answers, alternatives or tips.
    expect(txt).not.toContain("3/4");
    expect(txt).not.toContain("também: 0.75");
    expect(txt).not.toContain("some");
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

describe("PdfQuestion — auto number header", () => {
  it("renders the automatic number passed in, and no points/difficulty", () => {
    const block: Extract<Block, { type: "question" }> = {
      id: id(1),
      type: "question",
      stem: [{ id: id(2), type: "paragraph", content: rt("s") }],
      answer: { kind: "open" },
    };
    const txt = textOf(PdfQuestion({ block, number: 1 }));
    expect(txt).toContain("1.");
    expect(txt).toContain("s");
    expect(txt).not.toContain("pts");
    expect(txt).not.toContain("Difícil");
  });

  it("renders the instruction alongside the auto number", () => {
    const block: Extract<Block, { type: "question" }> = {
      id: id(1),
      type: "question",
      stem: [{ id: id(2), type: "paragraph", content: rt("stem") }],
      instruction: rt("faça assim"),
      answer: { kind: "open" },
    };
    const txt = textOf(PdfQuestion({ block, number: 3 }));
    expect(txt).toContain("3.");
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

  /** Find the inner <Image> element produced by PdfImage's <View> wrapper. */
  function imageStyleOf(block: Extract<Block, { type: "image" }>) {
    const view = PdfImage({ block }) as ReactElement;
    const children = (view.props as { children?: unknown }).children;
    const image = (Array.isArray(children) ? children : [children]).find(
      (c) => isValidElement(c) && c.type === Image,
    ) as ReactElement;
    return image.props.style as {
      width?: number;
      maxWidth?: string;
      maxHeight?: number;
      objectFit?: string;
    };
  }

  it("constrains the image to the page so it cannot overflow onto following blocks (no width)", () => {
    const style = imageStyleOf({ id: id(1), type: "image", src: "https://x/y.png", alt: "a" });
    // Mirrors the screen's `max-w-full`: never wider than the content box…
    expect(style.maxWidth).toBe("100%");
    // …and never taller than a page, so react-pdf paginates instead of overflowing.
    // The cap must stay under the A4 content height (~762pt = 841.89 − 2×40 margin)
    // with margin, so a tall image always fits a fresh page (verified empirically:
    // react-pdf flags it as un-wrappable above ~750pt).
    expect(typeof style.maxHeight).toBe("number");
    expect(style.maxHeight as number).toBeGreaterThan(0);
    expect(style.maxHeight as number).toBeLessThanOrEqual(740);
    expect(style.objectFit).toBe("contain");
  });

  it("falls back to the shared default width when the block carries none, matching the editor", () => {
    // An image with no explicit width must NOT fill the whole content box in the
    // PDF (react-pdf's default for a widthless <Image>). It falls back to the same
    // DEFAULT_IMAGE_WIDTH_PX the editor's resizer shows (300px → 225pt), so the
    // exported size matches what the user sees while editing.
    const style = imageStyleOf({ id: id(1), type: "image", src: "https://x/y.png", alt: "a" });
    expect(style.width).toBeCloseTo(225, 5);
  });

  it("converts an explicit width from px to pt and still applies the page constraints", () => {
    const style = imageStyleOf({ id: id(1), type: "image", src: "https://x/y.png", alt: "a", width: 400 });
    // 400px → 300pt (1px = 72/96 pt), matching the on-screen physical size.
    expect(style.width).toBeCloseTo(300, 5);
    expect(style.maxWidth).toBe("100%");
    expect(typeof style.maxHeight).toBe("number");
    expect(style.objectFit).toBe("contain");
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
  it("renders the latex source in a centered inner Text inside a View wrapper", () => {
    const block: Extract<Block, { type: "blockMath" }> = {
      id: id(1),
      type: "blockMath",
      latex: "E=mc^2",
    };
    const el = PdfMath({ block }) as ReactElement;
    // The outer element is now a <View> (block spacing); textAlign lives on the
    // inner <Text> child.
    expect(el.type).toBe(View);
    const innerText = (el.props as { children: ReactElement }).children;
    expect((innerText.props.style as { textAlign: string }).textAlign).toBe("center");
    expect(textOf(el)).toContain("E=mc^2");
  });
});

// ---------------------------------------------------------------------------
// Layout regression tests — vertical stacking / text overlap prevention
// ---------------------------------------------------------------------------
// These tests guard the structural invariants that prevent text overlap in the
// generated PDF. The root cause was bare <Text> blocks used as column children
// in react-pdf: their marginBottom was silently ignored by Yoga when mixed with
// <View> siblings, causing consecutive text blocks to overlap.
//
// Fix: PdfParagraph, PdfHeading and PdfMath all wrap their content in a <View>
// that carries the block-level marginBottom. The inner <Text> handles only text
// styling. PdfAnswer row markers use flexShrink:0 to prevent collapsing.

// DEFAULT_BLOCK_GAP_PT: 16px * 72/96 = 12pt (the doc-level default when no pageStyle)
const DEFAULT_BLOCK_GAP_PT = 12;

describe("Layout — PdfParagraph wraps content in a View (prevents overlap)", () => {
  it("outer element is a View with a positive marginBottom by default", () => {
    const block: Extract<Block, { type: "paragraph" }> = {
      id: id(1),
      type: "paragraph",
      content: rt("hello world"),
    };
    const el = PdfParagraph({ block, blockGap: DEFAULT_BLOCK_GAP_PT }) as ReactElement;
    expect(el.type).toBe(View);
    const mb = (el.props.style as { marginBottom?: number }).marginBottom;
    expect(mb).toBeGreaterThan(0);
  });

  it("uses blockGap as the default marginBottom (no spacingAfter on block)", () => {
    const block: Extract<Block, { type: "paragraph" }> = {
      id: id(1),
      type: "paragraph",
      content: rt("hello world"),
    };
    const el = PdfParagraph({ block, blockGap: DEFAULT_BLOCK_GAP_PT }) as ReactElement;
    expect((el.props.style as { marginBottom?: number }).marginBottom).toBe(DEFAULT_BLOCK_GAP_PT);
  });

  it("outer View carries the spacingAfter from nodeStyle as marginBottom (overrides blockGap)", () => {
    const block: Extract<Block, { type: "paragraph" }> = {
      id: id(1),
      type: "paragraph",
      content: rt("spaced"),
      style: { spacingAfter: 20 },
    };
    const el = PdfParagraph({ block, blockGap: DEFAULT_BLOCK_GAP_PT }) as ReactElement;
    expect((el.props.style as { marginBottom?: number }).marginBottom).toBe(20);
  });

  it("outer View marginBottom is 0 when spacingAfter is explicitly 0 (author intent)", () => {
    const block: Extract<Block, { type: "paragraph" }> = {
      id: id(1),
      type: "paragraph",
      content: rt("no gap"),
      style: { spacingAfter: 0 },
    };
    const el = PdfParagraph({ block, blockGap: DEFAULT_BLOCK_GAP_PT }) as ReactElement;
    expect((el.props.style as { marginBottom?: number }).marginBottom).toBe(0);
  });

  it("inner element is a Text (not another View), preserving text wrapping", () => {
    const block: Extract<Block, { type: "paragraph" }> = {
      id: id(1),
      type: "paragraph",
      content: rt("content"),
    };
    const el = PdfParagraph({ block, blockGap: DEFAULT_BLOCK_GAP_PT }) as ReactElement;
    const inner = (el.props as { children: ReactElement }).children;
    expect(inner.type).toBe(Text);
  });

  it("text content is preserved inside the inner Text", () => {
    const block: Extract<Block, { type: "paragraph" }> = {
      id: id(1),
      type: "paragraph",
      content: rt("my paragraph"),
    };
    expect(textOf(PdfParagraph({ block, blockGap: DEFAULT_BLOCK_GAP_PT }))).toContain("my paragraph");
  });
});

describe("Layout — PdfHeading wraps content in a View (prevents overlap)", () => {
  it("outer element is a View with marginBottom", () => {
    const block: Extract<Block, { type: "heading" }> = {
      id: id(1),
      type: "heading",
      level: 1,
      content: rt("Title"),
    };
    const el = PdfHeading({ block, blockGap: DEFAULT_BLOCK_GAP_PT }) as ReactElement;
    expect(el.type).toBe(View);
    const mb = (el.props.style as { marginBottom?: number }).marginBottom;
    expect(mb).toBeGreaterThan(0);
  });

  it("uses blockGap as the default marginBottom (no spacingAfter on block)", () => {
    const block: Extract<Block, { type: "heading" }> = {
      id: id(1),
      type: "heading",
      level: 1,
      content: rt("Title"),
    };
    const el = PdfHeading({ block, blockGap: DEFAULT_BLOCK_GAP_PT }) as ReactElement;
    expect((el.props.style as { marginBottom?: number }).marginBottom).toBe(DEFAULT_BLOCK_GAP_PT);
  });

  it("inner Text carries the heading font size", () => {
    const block: Extract<Block, { type: "heading" }> = {
      id: id(1),
      type: "heading",
      level: 2,
      content: rt("Sub"),
    };
    const el = PdfHeading({ block, blockGap: DEFAULT_BLOCK_GAP_PT }) as ReactElement;
    const inner = (el.props as { children: ReactElement }).children;
    expect(inner.type).toBe(Text);
    expect((inner.props.style as { fontSize?: number }).fontSize).toBe(18);
  });

  it("spacingAfter from nodeStyle overrides the default marginBottom on the View (overrides blockGap)", () => {
    const block: Extract<Block, { type: "heading" }> = {
      id: id(1),
      type: "heading",
      level: 3,
      content: rt("H3"),
      style: { spacingAfter: 16 },
    };
    const el = PdfHeading({ block, blockGap: DEFAULT_BLOCK_GAP_PT }) as ReactElement;
    expect((el.props.style as { marginBottom?: number }).marginBottom).toBe(16);
  });
});

describe("Layout — PdfMath outer View carries block spacing (prevents overlap)", () => {
  it("outer element is a View, not a bare Text", () => {
    const block: Extract<Block, { type: "blockMath" }> = {
      id: id(1),
      type: "blockMath",
      latex: "x^2",
    };
    expect((PdfMath({ block }) as ReactElement).type).toBe(View);
  });
});

describe("Layout — PdfAnswer marker has flexShrink:0 (prevents row overlap)", () => {
  it("multipleChoice marker Text has flexShrink:0 to prevent collapsing into content", () => {
    const answer: QuestionAnswer = {
      kind: "multipleChoice",
      alternatives: [{ id: id(1), content: rt("opt"), correct: true }],
    };
    const el = PdfAnswer({ answer }) as ReactElement;
    // Outer <View> → first row <View> → first child <Text> (the marker)
    const firstRow = (el.props as { children: ReactElement[] }).children[0] as ReactElement;
    const markerText = (firstRow.props as { children: ReactElement[] }).children[0] as ReactElement;
    expect((markerText.props.style as { flexShrink?: number }).flexShrink).toBe(0);
  });

  it("matching connector has flexShrink:0 to prevent squeezing between FLEX columns", () => {
    const answer: QuestionAnswer = {
      kind: "matching",
      pairs: [{ id: id(1), left: rt("A"), right: rt("B") }],
    };
    const el = PdfAnswer({ answer }) as ReactElement;
    const firstRow = (el.props as { children: ReactElement[] }).children[0] as ReactElement;
    // Row children: [leftView, connectorText, rightView]
    const connector = (firstRow.props as { children: ReactElement[] }).children[1] as ReactElement;
    expect((connector.props.style as { flexShrink?: number }).flexShrink).toBe(0);
  });
});

describe("Layout — PdfQuestion uses column flex for proper block stacking", () => {
  it("outer View has flexDirection:column so stem blocks stack vertically", () => {
    const block: Extract<Block, { type: "question" }> = {
      id: id(1),
      type: "question",
      stem: [{ id: id(2), type: "paragraph", content: rt("stem") }],
      answer: { kind: "open" },
    };
    const el = PdfQuestion({ block, number: 1 }) as ReactElement;
    expect(el.type).toBe(View);
    expect((el.props.style as { flexDirection?: string }).flexDirection).toBe("column");
  });
});
