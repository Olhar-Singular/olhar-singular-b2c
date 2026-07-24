import { describe, it, expect } from "vitest";
import { INSERTER_SECTIONS } from "./blockInserterItems";
import { QUESTION_KINDS } from "../questionKinds";
import { tryProseMirrorToCanonical } from "@/lib/adaptation/tiptap/toCanonical";

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

  /**
   * B8 · gatilho G4 — inserting a block must never make the WHOLE document
   * unrepresentable. "Imagem" used to build `src: ""`, which fails the canonical
   * `src.min(1)`, so the very act of adding an image froze the autosave for the
   * entire sheet until a file was picked — with the UI still reading "Salvo".
   *
   * Stated as a property over every item so a new inserter entry cannot
   * reintroduce the class of bug.
   */
  it("every insertable item builds a node that maps back to a VALID canonical doc", () => {
    for (const section of INSERTER_SECTIONS) {
      for (const item of section.items) {
        if (item.action.type !== "insert") continue;
        const result = tryProseMirrorToCanonical({
          type: "doc",
          content: [item.action.build()],
        });
        expect(result.ok, `item "${item.id}" inserts an unrepresentable node`).toBe(true);
      }
    }
  });
});
