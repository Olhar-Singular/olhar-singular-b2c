import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import { BlockMathNodeView } from "./BlockMathNodeView";

vi.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...rest }: { children: React.ReactNode }) => <div {...rest}>{children}</div>,
}));

const renderLatexToHtml = vi.fn((s: string) => `<span>${s}</span>`);
vi.mock("@/lib/domain/latexRenderer", () => ({
  renderLatexToHtml: (s: string, displayMode?: boolean) => renderLatexToHtml(s, displayMode),
}));

function makeProps(attrs: Record<string, unknown> = {}, editable = true) {
  const updateAttributes = vi.fn();
  const deleteNode = vi.fn();
  const props = {
    node: { attrs: { latex: "x^2", alt: null, ...attrs } },
    updateAttributes,
    deleteNode,
    editor: { isEditable: editable },
  } as unknown as NodeViewProps;
  return { props, updateAttributes, deleteNode };
}

beforeEach(() => vi.clearAllMocks());

describe("BlockMathNodeView", () => {
  it("renders KaTeX html and enters edit mode on click", () => {
    const { props } = makeProps();
    render(<BlockMathNodeView {...props} />);
    expect(screen.getByTestId("blockmath-render")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("blockmath-render"));
    expect(screen.getByLabelText("Expressão LaTeX")).toBeInTheDocument();
  });

  it("edits latex and alt, then closes edit mode", () => {
    const { props, updateAttributes } = makeProps({ alt: "alt" });
    render(<BlockMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("blockmath-render"));
    fireEvent.change(screen.getByLabelText("Expressão LaTeX"), { target: { value: "y" } });
    fireEvent.change(screen.getByLabelText("Texto alternativo da fórmula"), { target: { value: "" } });
    expect(updateAttributes).toHaveBeenCalledWith({ latex: "y" });
    expect(updateAttributes).toHaveBeenCalledWith({ alt: null });
    fireEvent.click(screen.getByText("Pronto"));
    expect(screen.getByTestId("blockmath-render")).toBeInTheDocument();
  });

  it("does not enter edit mode when disabled", () => {
    const { props } = makeProps({}, false);
    render(<BlockMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("blockmath-render"));
    expect(screen.queryByLabelText("Expressão LaTeX")).not.toBeInTheDocument();
  });

  it("calls deleteNode when the delete button is clicked", () => {
    const { props, deleteNode } = makeProps();
    render(<BlockMathNodeView {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir fórmula" }));
    expect(deleteNode).toHaveBeenCalledTimes(1);
  });

  it("disables the delete button when not editable", () => {
    const { props } = makeProps({}, false);
    render(<BlockMathNodeView {...props} />);
    expect(screen.getByRole("button", { name: "Excluir fórmula" })).toBeDisabled();
  });

  /** B8 · gatilho G4 — see the sibling test in InlineMathNodeView.test.tsx. */
  it("lets the field be cleared WITHOUT writing an empty latex onto the node", () => {
    const { props, updateAttributes } = makeProps();
    render(<BlockMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("blockmath-render"));
    const input = screen.getByLabelText("Expressão LaTeX");

    fireEvent.change(input, { target: { value: "" } });

    expect((input as HTMLInputElement).value).toBe("");
    expect(updateAttributes).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "z" } });
    expect(updateAttributes).toHaveBeenCalledWith({ latex: "z" });
  });
  /**
   * Achado 0006 — the read-only renders (`BlockMathView`) expose `role="math"`
   * with the alt as accessible name; the editor dropped both, so the alt the
   * teacher typed never reached the DOM of the screen where he reviews it.
   */
  it("exposes the formula as math with the alt as accessible name", () => {
    const { props } = makeProps({ alt: "x ao quadrado" });
    render(<BlockMathNodeView {...props} />);
    const math = screen.getByTestId("blockmath-math");
    expect(math).toHaveAttribute("role", "math");
    expect(math).toHaveAttribute("aria-label", "x ao quadrado");
  });

  /**
   * Achado 0403 — o `role="math"` do 0006 estava no próprio `<button>` e
   * substituía o papel implícito, apagando a afordância de edição para o leitor
   * de tela (WCAG 4.1.2). O papel `math` pertence a um elemento não interativo.
   */
  it("keeps the clickable element announced as a button naming the formula", () => {
    const { props } = makeProps({ alt: "x ao quadrado" });
    render(<BlockMathNodeView {...props} />);
    const trigger = screen.getByTestId("blockmath-render");
    expect(trigger).not.toHaveAttribute("role");
    expect(screen.getByRole("button", { name: "Editar fórmula: x ao quadrado" })).toBe(trigger);
  });

  /**
   * Achado 0405 — o alvo de clique embrulhava a fórmula num `<button>` com
   * `p-2` + `border`, e ainda bloqueava o colapso da margem do `.katex-display`
   * com o `my-3` do wrapper: a mesma fórmula reservava 47px a mais de papel no
   * Revisar do que no impresso (`render/blocks/BlockMathView`), que é só um div
   * `my-3 text-center`. Chrome de edição não entra no fluxo vertical.
   */
  it("desenha o alvo de clique fora do fluxo vertical (achado 0405)", () => {
    const { props } = makeProps();
    render(<BlockMathNodeView {...props} />);
    const trigger = screen.getByTestId("blockmath-render");
    const math = screen.getByTestId("blockmath-math");

    // O botão é overlay: não ocupa altura nem empurra o bloco seguinte.
    expect(trigger.className).toContain("absolute");
    expect(trigger.className).not.toMatch(/(^|\s)p-\d/);
    expect(trigger.className).not.toMatch(/(^|\s)border(\s|$)/);
    // E a fórmula fica FORA dele: um botão no fluxo bloquearia o colapso da
    // margem do `.katex-display` com a do wrapper, somando as duas.
    expect(trigger.contains(math)).toBe(false);
  });

  it("espelha o espaçamento do impresso: my-3 no wrapper, sem chrome no meio", () => {
    const { props } = makeProps();
    render(<BlockMathNodeView {...props} />);
    const wrapper = screen.getByTestId("blockmath-node");
    expect(wrapper.className).toContain("my-3");
    const math = screen.getByTestId("blockmath-math");
    // nenhum ancestral entre a fórmula e o wrapper acrescenta padding/borda
    let el = math.parentElement;
    while (el && el !== wrapper) {
      expect(el.className).not.toMatch(/(^|\s)p-\d|(^|\s)border(\s|$)|(^|\s)my-\d/);
      el = el.parentElement;
    }
  });

  it("falls back to the latex as accessible name when there is no alt", () => {
    const { props } = makeProps({ alt: null });
    render(<BlockMathNodeView {...props} />);
    expect(screen.getByTestId("blockmath-math")).toHaveAttribute("aria-label", "x^2");
    expect(screen.getByTestId("blockmath-render")).toHaveAttribute(
      "aria-label",
      "Editar fórmula: x^2",
    );
  });
});
