import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/react";
import { buildRichTextFieldExtensions } from "./richTextFieldExtensions";

/**
 * Achado 0248 — `Ctrl+Z` não desfazia nada nos campos da folha.
 *
 * O `RichTextField` é um editor Tiptap ANINHADO e independente: o histórico do
 * editor de fora (a folha, via StarterKit) nunca vê a tecla, porque o NodeView
 * React segura o evento no campo. Sem o plugin de histórico próprio, `Mod-z`
 * não tinha keymap nenhum e um caractere digitado por engano virava estado
 * persistido pelo autosave, sem volta.
 *
 * Este teste roda o ProseMirror de verdade (sem mock de `@tiptap/react`, ao
 * contrário de `RichTextField.test.tsx`): um mock não provaria que o keymap
 * existe, só que a extensão está na lista.
 */
describe("RichTextField — histórico de desfazer/refazer", () => {
  const seed = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "oceano" }] }],
  };

  it("desfaz e refaz a última edição do campo", () => {
    const editor = new Editor({ extensions: buildRichTextFieldExtensions(), content: seed });

    editor.commands.focus("end");
    editor.commands.insertContent("X");
    expect(editor.getText()).toBe("oceanoX");

    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("oceano");

    expect(editor.commands.redo()).toBe(true);
    expect(editor.getText()).toBe("oceanoX");

    editor.destroy();
  });

  it("expõe o keymap de `Mod-z` / `Shift-Mod-z` no campo aninhado", () => {
    const editor = new Editor({ extensions: buildRichTextFieldExtensions(), content: seed });

    editor.commands.focus("end");
    editor.commands.insertContent("X");

    const handled = editor.view.someProp("handleKeyDown", (fn) =>
      fn(
        editor.view,
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true, metaKey: false }),
      ),
    );
    expect(handled).toBe(true);
    expect(editor.getText()).toBe("oceano");

    editor.destroy();
  });
});
