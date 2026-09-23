import { describe, it, expect, vi } from "vitest";
import {
  questionOrdinal,
  latexToHtml,
  inlineLatexToHtml,
  deleteNodeAndRefocus,
  type OrdinalDoc,
  type RefocusEditor,
} from "./nodeViewUtils";
import { renderLatexToHtml } from "@/lib/domain/latexRenderer";
import { Node as PMNode } from "@tiptap/pm/model";
import { getEditorSchema } from "@/lib/adaptation/tiptap/getEditorSchema";
import { canonicalToProseMirror } from "@/lib/adaptation/tiptap/fromCanonical";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

describe("questionOrdinal", () => {
  /** Build a fake doc from a list of [typeName, pos] node descriptors. */
  const docOf = (nodes: Array<[string, number]>): OrdinalDoc => ({
    descendants(fn) {
      for (const [name, pos] of nodes) fn({ type: { name } }, pos);
    },
  });

  it("returns 1 for the first question (no questions before it)", () => {
    const doc = docOf([
      ["paragraph", 0],
      ["question", 1],
      ["question", 10],
    ]);
    expect(questionOrdinal(doc, 1)).toBe(1);
  });

  it("counts only question nodes positioned before the target", () => {
    const doc = docOf([
      ["question", 0],
      ["paragraph", 5],
      ["question", 8],
      ["question", 20],
    ]);
    expect(questionOrdinal(doc, 8)).toBe(2);
    expect(questionOrdinal(doc, 20)).toBe(3);
  });

  it("ignores non-question nodes before the target", () => {
    const doc = docOf([
      ["heading", 0],
      ["paragraph", 2],
      ["question", 6],
    ]);
    expect(questionOrdinal(doc, 6)).toBe(1);
  });
});

describe("latexToHtml", () => {
  it("renders bare KaTeX in display mode, identical to the read-only renderer", () => {
    // Same engine + displayMode as BlockMathView so editor preview can never
    // diverge from the final render.
    expect(latexToHtml("a+b")).toBe(renderLatexToHtml("a+b", true));
  });
});

describe("inlineLatexToHtml", () => {
  it("renders bare KaTeX inline, identical to the read-only RichTextView", () => {
    expect(inlineLatexToHtml("x^2")).toBe(renderLatexToHtml("x^2", false));
  });
});

// Excluir um no da folha desmontava a arvore que hospeda o proprio botao: o
// <button> focado saia do DOM e o navegador jogava o foco no <body> (achado
// 0253). Com o foco fora do ProseMirror, Tab recomeca do topo da pagina (WCAG
// 2.4.3) e o Ctrl+Z de recuperacao nao chega ao editor.
describe("deleteNodeAndRefocus", () => {
  /** Editor falso com `focus` espionavel e um doc de 30 posicoes. */
  const editorWith = () => {
    const spy = vi.fn();
    const editor = { commands: { focus: spy }, state: { doc: { content: { size: 30 } } } } as unknown as RefocusEditor;
    return { editor, spy };
  };

  it("devolve o foco a folha na posicao do no apagado", () => {
    const { editor, spy } = editorWith();
    const deleteNode = vi.fn();
    deleteNodeAndRefocus(deleteNode, editor, () => 7);
    expect(deleteNode).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(7);
  });

  it("le a posicao ANTES de apagar (depois o no ja nao existe)", () => {
    const { editor, spy } = editorWith();
    const order: string[] = [];
    const getPos = vi.fn(() => {
      order.push("getPos");
      return 4;
    });
    deleteNodeAndRefocus(() => order.push("delete"), editor, getPos);
    expect(order).toEqual(["getPos", "delete"]);
    expect(spy).toHaveBeenCalledWith(4);
  });

  it("limita a posicao ao tamanho do documento ja encolhido", () => {
    const { editor, spy } = editorWith();
    deleteNodeAndRefocus(vi.fn(), editor, () => 999);
    expect(spy).toHaveBeenCalledWith(30);
  });

  it("nunca foca posicao negativa", () => {
    const { editor, spy } = editorWith();
    deleteNodeAndRefocus(vi.fn(), editor, () => -5);
    expect(spy).toHaveBeenCalledWith(0);
  });

  it("foca o editor sem posicao quando a posicao e desconhecida", () => {
    const { editor, spy } = editorWith();
    deleteNodeAndRefocus(vi.fn(), editor, () => undefined);
    expect(spy).toHaveBeenCalledWith();
    deleteNodeAndRefocus(vi.fn(), editor);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("foca sem posicao quando o tamanho do documento e desconhecido", () => {
    const spy = vi.fn();
    const editor = { commands: { focus: spy } } as unknown as RefocusEditor;
    deleteNodeAndRefocus(vi.fn(), editor, () => 3);
    expect(spy).toHaveBeenCalledWith();
  });

  it("apaga mesmo quando o editor nao expoe focus", () => {
    const deleteNode = vi.fn();
    expect(() => deleteNodeAndRefocus(deleteNode, {} as RefocusEditor, () => 3)).not.toThrow();
    expect(deleteNode).toHaveBeenCalledTimes(1);
  });
});

// Achado 0352: `focus(pos)` do Tiptap SEMPRE cria uma TextSelection na posicao
// crua. A posicao de um nodeview e uma fronteira entre blocos, e o ProseMirror
// rejeita TextSelection ali ("TextSelection endpoint not pointing into a node
// with inline content (doc)"). O teste roda contra um documento ProseMirror
// REAL, montado com o schema canonico: com editor falso a posicao invalida
// nunca e resolvida e o defeito passa batido.
describe("deleteNodeAndRefocus — documento ProseMirror real (achado 0352)", () => {
  const schema = getEditorSchema();
  const uid0352 = (n: number): string =>
    `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

  /** Doc ja ENCOLHIDO (o no apagado nao esta mais la), como o helper o ve. */
  const docOfBlocks = (blocks: CanonicalDocument["blocks"]): PMNode =>
    PMNode.fromJSON(schema, canonicalToProseMirror({ schemaVersion: 1, blocks }));

  const para = (n: number): CanonicalDocument["blocks"][number] => ({
    id: uid0352(n),
    type: "paragraph",
    content: [{ type: "text", text: `p${n}` }],
  });

  const focusedOn = (doc: PMNode, posBefore: number): number | undefined => {
    const spy = vi.fn();
    const editor = { commands: { focus: spy }, state: { doc } } as unknown as RefocusEditor;
    deleteNodeAndRefocus(vi.fn(), editor, () => posBefore);
    expect(spy).toHaveBeenCalledTimes(1);
    return spy.mock.calls[0][0] as number | undefined;
  };

  it("poe o cursor dentro de conteudo inline, nunca na fronteira de bloco", () => {
    // [p1, imagem, p2] com a imagem ja apagada -> [p1, p2].
    const doc = docOfBlocks([para(1), para(2)]);
    const posDaImagem = doc.child(0).nodeSize; // fronteira entre p1 e p2
    const pos = focusedOn(doc, posDaImagem);
    expect(typeof pos).toBe("number");
    expect(doc.resolve(pos as number).parent.inlineContent).toBe(true);
  });

  it("foca a folha sem posicao quando o documento nao tem posicao de texto", () => {
    // Sem nenhum bloco de texto, o ProseMirror nao devolve TextSelection
    // nenhuma: focar a folha sem posicao preserva a selecao que ele mesmo
    // escolheu ao aplicar a exclusao.
    const doc = docOfBlocks([{ id: uid0352(9), type: "divider" }]);
    expect(focusedOn(doc, 0)).toBeUndefined();
  });
});

describe("deleteNodeAndRefocus — anúncio em região viva (achado 0256)", () => {
  it("anuncia a exclusão numa região role=status depois de apagar o nó", async () => {
    const deleteNode = vi.fn();
    const editor: RefocusEditor = { commands: { focus: vi.fn() } };

    deleteNodeAndRefocus(deleteNode, editor, () => 0, "Questão 2 excluída");

    const region = await vi.waitFor(() => {
      const found = document.querySelector('[role="status"]');
      if (!found || !found.textContent?.trim()) throw new Error("sem anúncio");
      return found;
    });
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toContain("Questão 2 excluída");
  });
});
