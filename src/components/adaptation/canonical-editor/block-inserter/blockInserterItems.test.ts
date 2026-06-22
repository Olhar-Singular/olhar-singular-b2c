import { describe, it, expect } from "vitest";
import { INSERTER_SECTIONS } from "./blockInserterItems";
import { QUESTION_KINDS } from "../questionKinds";

/** Narrow an item's action to the "insert" variant and run its builder. */
function buildOf(sectionId: string, itemId: string) {
  const section = INSERTER_SECTIONS.find((s) => s.id === sectionId)!;
  const item = section.items.find((i) => i.id === itemId)!;
  if (item.action.type !== "insert") throw new Error("not an insert item");
  return item.action.build();
}

describe("INSERTER_SECTIONS", () => {
  it("has a Questão section and a Texto e mídia section", () => {
    expect(INSERTER_SECTIONS.map((s) => s.id)).toEqual(["question", "text-media"]);
    expect(INSERTER_SECTIONS[0].label).toBe("Questão");
    expect(INSERTER_SECTIONS[1].label).toBe("Texto e mídia");
  });

  it("offers one insertable item per question kind, labelled from QUESTION_KINDS", () => {
    const section = INSERTER_SECTIONS[0];
    expect(section.items).toHaveLength(QUESTION_KINDS.length);
    QUESTION_KINDS.forEach(({ kind, label }) => {
      const item = section.items.find((i) => i.id === `question:${kind}`)!;
      expect(item.label).toBe(label);
      expect(item.action.type).toBe("insert");
    });
  });

  it("every question item builds a question node", () => {
    for (const { kind } of QUESTION_KINDS) {
      expect(buildOf("question", `question:${kind}`).type).toBe("question");
    }
  });

  it("maps Texto e mídia items to the matching canonical builders", () => {
    expect(buildOf("text-media", "heading1")).toMatchObject({ type: "heading", attrs: { level: 1 } });
    expect(buildOf("text-media", "heading2")).toMatchObject({ type: "heading", attrs: { level: 2 } });
    expect(buildOf("text-media", "paragraph").type).toBe("paragraph");
    expect(buildOf("text-media", "image").type).toBe("image");
    expect(buildOf("text-media", "math").type).toBe("blockMath");
    expect(buildOf("text-media", "divider").type).toBe("divider");
  });

  it("does not include 'Banco de palavras' (wordbank) in the menu", () => {
    const textMedia = INSERTER_SECTIONS.find((s) => s.id === "text-media")!;
    expect(textMedia.items.find((i) => i.id === "wordbank")).toBeUndefined();
    expect(textMedia.items.map((i) => i.label)).not.toContain("Banco de palavras");
  });

  it("exposes Quebra de página as a pageBreak action that needs a following block", () => {
    const item = INSERTER_SECTIONS[1].items.find((i) => i.id === "pageBreak")!;
    expect(item.label).toBe("Quebra de página");
    expect(item.action.type).toBe("pageBreak");
    expect(item.needsFollowing).toBe(true);
  });
});
