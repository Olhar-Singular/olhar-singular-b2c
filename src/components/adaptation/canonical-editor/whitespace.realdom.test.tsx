import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { EditorContent } from "@tiptap/react";
import { useCanonicalEditor } from "./useCanonicalEditor";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

// Mesma razão do spellcheck.realdom.test.tsx: ImageNodeView importa o
// PdfPreviewModal (pdfjs-dist ⇒ DOMMatrix), que não existe no jsdom.
vi.mock("@/components/forms/PdfPreviewModal", () => ({ default: () => null }));

/**
 * Achado 0453 — a folha do Revisar quebrava a linha uma palavra antes da
 * prévia do Exportar e do PDF.
 *
 * O Tiptap injeta `.ProseMirror { white-space: break-spaces }`: o espaço no fim
 * da linha ocupa largura e não pendura, então a quebra só é aceita se
 * "palavra + espaço" couberem. A prévia (`normal`) e o `@react-pdf` deixam o
 * espaço final pendurar. `pre-wrap` preserva os espaços que o ProseMirror
 * precisa e deixa o espaço final pendurar, como nas outras duas superfícies.
 */
const doc: CanonicalDocument = {
  version: 1,
  blocks: [{ type: "paragraph", id: "p1", content: [{ type: "text", text: "texto em negrito" }] }],
};

function EditorHost() {
  const { editor } = useCanonicalEditor({ value: doc, onChange: () => {} });
  return <EditorContent editor={editor} />;
}

describe("regra de espaço da folha do Revisar (achado 0453)", () => {
  it("deixa o espaço final pendurar (pre-wrap, não o break-spaces do Tiptap)", async () => {
    const { container } = render(<EditorHost />);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror")).toBeTruthy();
    });

    const sheet = container.querySelector(".ProseMirror") as HTMLElement;
    expect(getComputedStyle(sheet).whiteSpace).toBe("pre-wrap");
  });
});
