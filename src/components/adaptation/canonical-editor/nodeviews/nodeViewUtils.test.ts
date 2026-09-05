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
