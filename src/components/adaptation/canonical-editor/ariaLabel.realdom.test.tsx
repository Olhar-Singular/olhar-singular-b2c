import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { EditorContent } from "@tiptap/react";
import { useCanonicalEditor } from "./useCanonicalEditor";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

// Mesma razão do CanonicalEditor.realdom.test.tsx: ImageNodeView importa o
// PdfPreviewModal (pdfjs-dist ⇒ DOMMatrix), que não existe no jsdom.
vi.mock("@/components/forms/PdfPreviewModal", () => ({ default: () => null }));

/**
 * Achado 0410 — a folha do Revisar é exposta como um `textbox` multilinha SEM
 * nome acessível: quem chega nela pelo teclado ouve "campo de texto, multilinha"
 * seguido do documento inteiro como valor, sem saber que aquilo é a atividade
 * adaptada. Os campos aninhados (`RichTextField`) já se nomeiam; o container que
 * guarda o documento inteiro, não. É WCAG 4.1.2 (Nome, Papel, Valor, nível A):
 * papel e valor estão lá, falta o nome.
 *
 * Roda o ProseMirror de verdade — com `@tiptap/react` mockado o atributo nunca
 * chegaria ao DOM e o teste passaria sem provar nada.
 */
const doc: CanonicalDocument = {
  version: 1,
  blocks: [{ type: "paragraph", id: "p1", content: [{ type: "text", text: "Evaporação" }] }],
};

function EditorHost() {
  const { editor } = useCanonicalEditor({ value: doc, onChange: () => {} });
  return <EditorContent editor={editor} />;
}

describe("nome acessível da folha do Revisar (achado 0410)", () => {
  // O nome é conferido pelo atributo, e não por `getByRole("textbox", { name })`:
  // no browser o `contenteditable` mapeia para `textbox`, mas o jsdom/aria-query
  // não faz esse mapeamento implícito (é o defeito separado do achado 0217, nos
  // campos aninhados). Declarar `role="textbox"` aqui é outra mudança, de outro
  // escopo, e apagaria a estrutura aninhada para parte dos leitores de tela.
  it("anuncia o editor da folha como a atividade adaptada", async () => {
    const { container } = render(<EditorHost />);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror")).toBeTruthy();
    });

    expect(container.querySelector(".ProseMirror")?.getAttribute("aria-label")).toMatch(
      /atividade adaptada/i,
    );
  });
});
