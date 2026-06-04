import { describe, it, expect } from "vitest";
import { BlockSchema } from "./schema";
import { newId } from "./ids";

const id = () => newId();
const textContent = [{ type: "text" as const, text: "hello" }];
const openAnswer = { kind: "open" as const };

describe("Block — heading", () => {
  it("accepts heading level 1", () => {
    expect(
      BlockSchema.safeParse({ id: id(), type: "heading", level: 1, content: textContent }).success
    ).toBe(true);
  });

  it("accepts heading levels 2 and 3", () => {
    expect(
      BlockSchema.safeParse({ id: id(), type: "heading", level: 2, content: textContent }).success
    ).toBe(true);
    expect(
      BlockSchema.safeParse({ id: id(), type: "heading", level: 3, content: textContent }).success
    ).toBe(true);
  });

  it("rejects heading with invalid level", () => {
    expect(
      BlockSchema.safeParse({ id: id(), type: "heading", level: 4, content: textContent }).success
    ).toBe(false);
  });

  it("requires a valid id", () => {
    expect(
      BlockSchema.safeParse({ id: "bad-id", type: "heading", level: 1, content: textContent }).success
    ).toBe(false);
  });
});

describe("Block — paragraph", () => {
  it("accepts a paragraph", () => {
    expect(
      BlockSchema.safeParse({ id: id(), type: "paragraph", content: textContent }).success
    ).toBe(true);
  });
});

describe("Block — blockMath", () => {
  it("accepts blockMath with latex", () => {
    expect(
      BlockSchema.safeParse({ id: id(), type: "blockMath", latex: "\\int_0^1 x\\,dx" }).success
    ).toBe(true);
  });

  it("accepts blockMath with optional alt", () => {
    expect(
      BlockSchema.safeParse({ id: id(), type: "blockMath", latex: "E=mc^2", alt: "E equals mc squared" }).success
    ).toBe(true);
  });

  it("rejects blockMath with empty latex", () => {
    expect(
      BlockSchema.safeParse({ id: id(), type: "blockMath", latex: "" }).success
    ).toBe(false);
  });
});

describe("Block — image", () => {
  it("accepts image with required src and alt", () => {
    expect(
      BlockSchema.safeParse({ id: id(), type: "image", src: "https://example.com/img.png", alt: "An image" }).success
    ).toBe(true);
  });

  it("accepts image with all optional fields", () => {
    expect(
      BlockSchema.safeParse({
        id: id(),
        type: "image",
        src: "https://example.com/img.png",
        alt: "An image",
        width: 800,
        alignment: "center",
        caption: textContent,
      }).success
    ).toBe(true);
  });

  it("rejects image without alt", () => {
    expect(
      BlockSchema.safeParse({ id: id(), type: "image", src: "https://example.com/img.png" }).success
    ).toBe(false);
  });

  it("rejects image without src", () => {
    expect(
      BlockSchema.safeParse({ id: id(), type: "image", alt: "An image" }).success
    ).toBe(false);
  });

  it("rejects image with empty src", () => {
    expect(
      BlockSchema.safeParse({ id: id(), type: "image", src: "", alt: "An image" }).success
    ).toBe(false);
  });

  it("rejects invalid alignment", () => {
    expect(
      BlockSchema.safeParse({ id: id(), type: "image", src: "x", alt: "y", alignment: "justify" }).success
    ).toBe(false);
  });
});

describe("Block — scaffolding", () => {
  it("accepts scaffolding with items", () => {
    expect(
      BlockSchema.safeParse({ id: id(), type: "scaffolding", items: ["step 1", "step 2"] }).success
    ).toBe(true);
  });

  it("accepts scaffolding with empty items", () => {
    expect(
      BlockSchema.safeParse({ id: id(), type: "scaffolding", items: [] }).success
    ).toBe(true);
  });
});

describe("Block — divider", () => {
  it("accepts a divider", () => {
    expect(
      BlockSchema.safeParse({ id: id(), type: "divider" }).success
    ).toBe(true);
  });
});

describe("Block — question", () => {
  it("accepts a minimal question", () => {
    expect(
      BlockSchema.safeParse({
        id: id(),
        type: "question",
        stem: [{ id: id(), type: "paragraph", content: textContent }],
        answer: openAnswer,
      }).success
    ).toBe(true);
  });

  it("accepts question with all optional fields", () => {
    expect(
      BlockSchema.safeParse({
        id: id(),
        type: "question",
        number: 1,
        points: 2.5,
        difficulty: "medio",
        stem: [{ id: id(), type: "paragraph", content: textContent }],
        instruction: textContent,
        answer: openAnswer,
      }).success
    ).toBe(true);
  });

  it("accepts valid difficulty values", () => {
    for (const difficulty of ["facil", "medio", "dificil"] as const) {
      expect(
        BlockSchema.safeParse({
          id: id(),
          type: "question",
          difficulty,
          stem: [],
          answer: openAnswer,
        }).success
      ).toBe(true);
    }
  });

  it("rejects invalid difficulty", () => {
    expect(
      BlockSchema.safeParse({
        id: id(),
        type: "question",
        difficulty: "easy",
        stem: [],
        answer: openAnswer,
      }).success
    ).toBe(false);
  });

  it("accepts recursive stem (question inside question)", () => {
    const inner = {
      id: id(),
      type: "question" as const,
      stem: [],
      answer: openAnswer,
    };
    expect(
      BlockSchema.safeParse({
        id: id(),
        type: "question",
        stem: [inner],
        answer: openAnswer,
      }).success
    ).toBe(true);
  });
});

describe("Block — unknown type", () => {
  it("rejects unknown block type", () => {
    expect(
      BlockSchema.safeParse({ id: id(), type: "unknown" }).success
    ).toBe(false);
  });
});
