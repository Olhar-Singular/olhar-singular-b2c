import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { buildExtensions } from "./getEditorSchema";

/**
 * C-31: a mark over a formula showed on the sheet and vanished on reload, because the
 * canonical `inlineMath` carries no marks. The mark simply must not stick to the formula;
 * the text around it keeps working.
 */
const content = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { id: "p1" },
      content: [
        { type: "text", text: "Calcule " },
        { type: "inlineMath", attrs: { latex: "x^2" } },
        { type: "text", text: " agora" },
      ],
    },
  ],
};

function withEditor(act: (editor: Editor) => void): Editor {
  const editor = new Editor({ extensions: buildExtensions(), content: content as never });
  try {
    act(editor);
    return editor;
  } finally {
    editor.destroy();
  }
}

type Json = { type: string; text?: string; marks?: { type: string }[]; content?: Json[] };
const inlines = (editor: Editor): Json[] => (editor.getJSON() as Json).content![0].content!;

describe("marks over a formula (C-31)", () => {
  it("bold over text + formula + text bolds the text and leaves the formula bare", () => {
    const editor = withEditor((e) => {
      e.commands.selectAll();
      e.commands.toggleBold();
      const [before, math, after] = inlines(e);
      expect(before.marks?.map((m) => m.type)).toEqual(["bold"]);
      expect(math.type).toBe("inlineMath");
      expect((math as { marks?: unknown }).marks).toBeUndefined();
      expect(after.marks?.map((m) => m.type)).toEqual(["bold"]);
    });
    expect(editor.isDestroyed).toBe(true);
  });

  it("colour over the selection does not reach the formula either", () => {
    withEditor((e) => {
      e.commands.selectAll();
      e.commands.setColor("#c00000");
      const [before, math, after] = inlines(e);
      expect(before.marks?.map((m) => m.type)).toEqual(["textStyle"]);
      expect((math as { marks?: unknown }).marks).toBeUndefined();
      expect(after.marks?.map((m) => m.type)).toEqual(["textStyle"]);
    });
  });

  it("pasted <strong> around a formula is dropped from the formula only", () => {
    withEditor((e) => {
      e.commands.selectAll();
      e.commands.insertContent(
        '<p>a <strong>b <span data-type="inline-math" latex="x">x</span> c</strong></p>',
      );
      const items = inlines(e);
      const math = items.find((i) => i.type === "inlineMath")!;
      expect((math as { marks?: unknown }).marks).toBeUndefined();
      expect(items.filter((i) => i.type === "text" && i.marks?.length).map((i) => i.text)).toEqual([
        "b ",
        " c",
      ]);
    });
  });

  it("leaves edits that do not touch a formula alone (no extra transaction)", () => {
    withEditor((e) => {
      e.commands.focus("end");
      e.commands.insertContent("!");
      expect(inlines(e).map((i) => i.type)).toEqual(["text", "inlineMath", "text"]);
    });
  });
});
