import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { EditorContent } from "@tiptap/react";
import { useCanonicalEditor } from "./useCanonicalEditor";
import { richDocument } from "@/lib/adaptation/tiptap/__fixtures__/richDocument";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

// ImageNodeView statically imports PdfPreviewModal (for "Recortar do original"),
// which pulls in pdfjs-dist — that references DOMMatrix, undefined under jsdom.
// This test never configures UploadedExamExtension, so the real component would
// never actually render the modal anyway (canCropFromOriginal stays false) —
// only the module-load-time import needs breaking here, not any behavior.
vi.mock("@/components/forms/PdfPreviewModal", () => ({ default: () => null }));

/**
 * Real-DOM mount smoke for the canonical editor — deliberately does NOT mock
 * `@tiptap/react`.
 *
 * The other component tests mock `@tiptap/react` (per file), so the real
 * ProseMirror EditorView and the React NodeViews never mount — a node missing
 * `renderHTML`/`toDOM`, or a NodeView that throws on render, ships green. That is
 * exactly how `node.type.spec.toDOM is not a function` crashed the mounted editor
 * in production while 1684 unit tests passed. This test mounts the editor for
 * real with a full fixture and asserts it renders, closing that gap end-to-end.
 *
 * Schema-level sibling guard (toDOM/parseHTML per node):
 * src/lib/adaptation/tiptap/domSerialization.test.ts
 */
function EditorHost({ value }: { value: CanonicalDocument }) {
  const { editor } = useCanonicalEditor({ value, onChange: () => {} });
  return <EditorContent editor={editor} />;
}

describe("CanonicalEditor — real DOM mount (sem mock de @tiptap/react)", () => {
  it("mounts the real editor with a full document and renders every question NodeView", async () => {
    const expectedQuestions = richDocument.blocks.filter((b) => b.type === "question").length;

    const { container } = render(<EditorHost value={richDocument} />);

    // The real ProseMirror EditorView mounts — this is the operation that crashed.
    await waitFor(() => {
      expect(container.querySelector(".ProseMirror")).toBeTruthy();
    });

    // Every question's React NodeView renders (QuestionNodeView → data-testid).
    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="question-node"]')).toHaveLength(
        expectedQuestions,
      );
    });
  });
});

/**
 * Achado 0350 — selecionar um átomo na folha não pintava nada.
 *
 * A única regra de seleção do projeto mirava `.tiptap img.editor-image`, classe
 * que nenhum elemento carrega desde que a imagem virou NodeView React: o
 * `ProseMirror-selectednode` era carimbado no wrapper e ninguém o lia. Com o
 * `@tiptap/react` mockado (como nos testes de nodeview) isso passa despercebido,
 * porque a `NodeSelection` real nunca acontece — daí o teste viver aqui, no
 * mount de DOM real.
 */
describe("CanonicalEditor — seleção de nó atômico (achado 0350)", () => {
  it("pinta o átomo selecionado na folha", async () => {
    let editor: ReturnType<typeof useCanonicalEditor>["editor"] = null;
    function Host() {
      const bag = useCanonicalEditor({ value: richDocument, onChange: () => {} });
      editor = bag.editor;
      return <EditorContent editor={bag.editor} />;
    }

    const { container } = render(<Host />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="image-node"]')).toBeTruthy();
    });

    const image = container.querySelector('[data-testid="image-node"]') as HTMLElement;
    expect(image.className).not.toMatch(/ring-2/);

    let imagePos = -1;
    editor!.state.doc.descendants((node, pos) => {
      if (node.type.name === "image" && imagePos === -1) imagePos = pos;
      return true;
    });
    expect(imagePos).toBeGreaterThanOrEqual(0);

    editor!.commands.setNodeSelection(imagePos);

    await waitFor(() => {
      const wrapper = container.querySelector('[data-testid="image-node"]') as HTMLElement;
      expect(wrapper.className).toMatch(/ring-2/);
      expect(wrapper.className).toMatch(/ring-surface-accent/);
    });
  });
});
