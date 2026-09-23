import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { EditorContent } from "@tiptap/react";
import { useCanonicalEditor } from "./useCanonicalEditor";
import { RichTextField } from "./RichTextField";
import type { CanonicalDocument, RichText } from "@/lib/adaptation/canonical/schema";

// Mesma razão do CanonicalEditor.realdom.test.tsx: ImageNodeView importa o
// PdfPreviewModal (pdfjs-dist ⇒ DOMMatrix), que não existe no jsdom.
vi.mock("@/components/forms/PdfPreviewModal", () => ({ default: () => null }));

/**
 * Achado 0219 — a folha do Revisar é a prévia do impresso, e o corretor
 * ortográfico do browser a rabisca.
 *
 * `contenteditable` sem `spellcheck` herda `spellcheck=true`: o Chrome desenha
 * sublinhado vermelho ondulado sob cada palavra que o dicionário não conhece
 * (texto vindo da IA, termos, nomes próprios, grafia sem acento do original).
 * Nada disso existe no PDF, então tela e arquivo divergem sem que o produto
 * tenha pedido. Roda o ProseMirror de verdade — com `@tiptap/react` mockado o
 * atributo nunca chegaria ao DOM.
 */
const doc: CanonicalDocument = {
  version: 1,
  blocks: [{ type: "paragraph", id: "p1", content: [{ type: "text", text: "Evaporacao" }] }],
};

function EditorHost() {
  const { editor } = useCanonicalEditor({ value: doc, onChange: () => {} });
  return <EditorContent editor={editor} />;
}

describe("spellcheck na folha do Revisar (achado 0219)", () => {
  it("desliga o corretor ortográfico no editor da folha", async () => {
    const { container } = render(<EditorHost />);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror")).toBeTruthy();
    });

    expect(container.querySelector(".ProseMirror")?.getAttribute("spellcheck")).toBe("false");
  });

  it("desliga o corretor ortográfico nos campos aninhados", async () => {
    const value: RichText = [{ type: "text", text: "condensacao" }];
    const { container } = render(<RichTextField noBubble value={value} onChange={vi.fn()} />);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror")).toBeTruthy();
    });

    expect(container.querySelector(".ProseMirror")?.getAttribute("spellcheck")).toBe("false");
  });
});
