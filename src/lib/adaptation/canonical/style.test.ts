import { describe, it, expect } from "vitest";
import { BlockSchema } from "./schema";
import { newId } from "./ids";
import { ALLOWED_COLORS } from "./colors";

const id = () => newId();
const textContent = [{ type: "text" as const, text: "hello" }];

/** Helper to create a paragraph block with an optional style payload */
function para(style?: Record<string, unknown>) {
  return {
    id: id(),
    type: "paragraph" as const,
    content: textContent,
    ...(style !== undefined ? { style } : {}),
  };
}

describe("NodeStyle — all block types accept style", () => {
  it("accepts paragraph without style (style optional)", () => {
    expect(BlockSchema.safeParse(para()).success).toBe(true);
  });

  it("accepts paragraph with empty style object", () => {
    expect(BlockSchema.safeParse(para({})).success).toBe(true);
  });

  it("accepts all style fields with valid values", () => {
    expect(
      BlockSchema.safeParse(
        para({
          fontFamily: "OpenDyslexic",
          fontSize: 14,
          align: "center",
          color: ALLOWED_COLORS[0],
          spacingAfter: 8,
          pageBreakBefore: true,
        })
      ).success
    ).toBe(true);
  });

  it("accepts left/right/justify align values", () => {
    for (const align of ["left", "right", "justify"] as const) {
      expect(BlockSchema.safeParse(para({ align })).success).toBe(true);
    }
  });

  it("accepts spacingAfter = 0 (nonnegative)", () => {
    expect(BlockSchema.safeParse(para({ spacingAfter: 0 })).success).toBe(true);
  });

  it("rejects spacingAfter < 0", () => {
    expect(BlockSchema.safeParse(para({ spacingAfter: -1 })).success).toBe(false);
  });

  it("rejects fontSize = 0 (must be positive)", () => {
    expect(BlockSchema.safeParse(para({ fontSize: 0 })).success).toBe(false);
  });

  it("rejects fontSize < 0", () => {
    expect(BlockSchema.safeParse(para({ fontSize: -2 })).success).toBe(false);
  });

  it("rejects invalid align value", () => {
    expect(BlockSchema.safeParse(para({ align: "middle" })).success).toBe(false);
  });

  it("rejects color outside allowlist", () => {
    expect(BlockSchema.safeParse(para({ color: "#000000" })).success).toBe(false);
  });

  it("rejects extra/unknown style properties (strict)", () => {
    expect(BlockSchema.safeParse(para({ unknownProp: "foo" })).success).toBe(false);
  });

  it("style works on heading blocks too", () => {
    expect(
      BlockSchema.safeParse({
        id: id(),
        type: "heading",
        level: 2,
        content: textContent,
        style: { fontSize: 18, align: "center" },
      }).success
    ).toBe(true);
  });

  it("style works on image blocks", () => {
    expect(
      BlockSchema.safeParse({
        id: id(),
        type: "image",
        src: "https://x.com/img.png",
        alt: "img",
        style: { spacingAfter: 16, pageBreakBefore: false },
      }).success
    ).toBe(true);
  });

  it("style works on divider blocks", () => {
    expect(
      BlockSchema.safeParse({
        id: id(),
        type: "divider",
        style: { spacingAfter: 4 },
      }).success
    ).toBe(true);
  });

  it("style works on blockMath blocks", () => {
    expect(
      BlockSchema.safeParse({
        id: id(),
        type: "blockMath",
        latex: "x^2",
        style: { align: "center" },
      }).success
    ).toBe(true);
  });

  it("style works on scaffolding blocks", () => {
    expect(
      BlockSchema.safeParse({
        id: id(),
        type: "scaffolding",
        items: ["step 1"],
        style: { fontFamily: "Arial" },
      }).success
    ).toBe(true);
  });

  it("style works on question blocks", () => {
    expect(
      BlockSchema.safeParse({
        id: id(),
        type: "question",
        stem: [],
        answer: { kind: "open" },
        style: { pageBreakBefore: true },
      }).success
    ).toBe(true);
  });
});
