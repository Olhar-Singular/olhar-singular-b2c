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
  it("mantem o rail no DOM e alcancavel por toque e teclado (achado 0232)", () => {
    const { props } = makeProps();
    const { container } = render(<BlockMathNodeView {...props} />);
    const rail = container.querySelector('[data-role="blockmath-rail"]');
    expect(rail?.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(rail?.className).toMatch(/opacity-0/);
    expect(rail?.className).toMatch(/(^|\s)focus-within:opacity-100/);
    expect(rail?.className).toMatch(/\[@media\(hover:none\)\]:opacity-100/);
  });

  it("ancora o rail acima da formula e reserva papel em ponteiro grosso (achado 0233)", () => {
    const { props } = makeProps();
    const { container } = render(<BlockMathNodeView {...props} />);
    const rail = container.querySelector('[data-role="blockmath-rail"]');
    const wrapper = container.querySelector('[data-testid="blockmath-node"]');
    // O rail e uma caixa opaca; em (hover:none) ele e permanente. Ancorado em
    // top-0 ele tapava a propria formula, e ancorado acima sem reserva taparia
    // o bloco anterior (achado 0233).
    expect(rail?.className).toMatch(/-translate-y-full/);
    expect(wrapper?.className).toMatch(/\[@media\(hover:none\)\]:mt-10/);
  });

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

  /**
   * Achado 0420 — o rail é uma caixa opaca ancorada ACIMA do bloco, revelada por
   * `group-focus-within`. O `autoFocus` do campo de LaTeX acende o rail assim que
   * o editor abre, então em ponteiro fino a invasão do bloco de cima deixa de ser
   * um relance de hover e vira o estado estável da edição: a lixeira cobre o fim
   * do parágrafo anterior e rouba o clique de volta ao texto, apagando a fórmula
   * sem confirmação. Enquanto o editor está aberto o rail não existe; a exclusão
   * mora dentro da caixa do editor, ao lado de "Pronto".
   */
  it("nao desenha o rail flutuante enquanto o editor esta aberto (achado 0420)", () => {
    const { props } = makeProps();
    const { container } = render(<BlockMathNodeView {...props} />);
    expect(container.querySelector('[data-role="blockmath-rail"]')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("blockmath-render"));

    expect(container.querySelector('[data-role="blockmath-rail"]')).not.toBeInTheDocument();
    const del = screen.getByRole("button", { name: "Excluir fórmula" });
    const card = screen.getByLabelText("Expressão LaTeX").closest("div");
    expect(card?.parentElement?.contains(del)).toBe(true);
    // e nada entre a lixeira e o wrapper tira a caixa opaca do fluxo do nó
    let el: HTMLElement | null = del;
    while (el && el !== screen.getByTestId("blockmath-node")) {
      expect(el.className).not.toMatch(/-translate-y-full|(^|\s)absolute(\s|$)/);
      el = el.parentElement;
    }
  });

  it("exclui a formula pelo botao de dentro do editor (achado 0420)", () => {
    const { props, deleteNode } = makeProps();
    render(<BlockMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("blockmath-render"));
    fireEvent.click(screen.getByRole("button", { name: "Excluir fórmula" }));
    expect(deleteNode).toHaveBeenCalledTimes(1);
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
