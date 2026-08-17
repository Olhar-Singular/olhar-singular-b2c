import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import { InlineMathNodeView } from "./InlineMathNodeView";

vi.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...rest }: { children: React.ReactNode }) => (
    <span {...rest}>{children}</span>
  ),
}));

const renderLatexToHtml = vi.fn((s: string) => `<span>${s}</span>`);
vi.mock("@/lib/domain/latexRenderer", () => ({
  renderLatexToHtml: (s: string, displayMode?: boolean) => renderLatexToHtml(s, displayMode),
}));

function makeProps(attrs: Record<string, unknown> = {}, editable = true) {
  const updateAttributes = vi.fn();
  const props = {
    node: { attrs: { latex: "x^2", alt: null, ...attrs } },
    updateAttributes,
    editor: { isEditable: editable },
  } as unknown as NodeViewProps;
  return { props, updateAttributes };
}

beforeEach(() => vi.clearAllMocks());

describe("InlineMathNodeView", () => {
  it("renders inline KaTeX (display mode false) and enters edit mode on click", () => {
    const { props } = makeProps();
    render(<InlineMathNodeView {...props} />);
    expect(screen.getByTestId("inlinemath-render")).toBeInTheDocument();
    expect(renderLatexToHtml).toHaveBeenCalledWith("x^2", false);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    expect(screen.getByLabelText("Expressão LaTeX inline")).toBeInTheDocument();
  });

  it("edits the latex attr and closes edit mode", () => {
    const { props, updateAttributes } = makeProps();
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    fireEvent.change(screen.getByLabelText("Expressão LaTeX inline"), { target: { value: "y" } });
    expect(updateAttributes).toHaveBeenCalledWith({ latex: "y" });
    fireEvent.click(screen.getByText("Pronto"));
    expect(screen.getByTestId("inlinemath-render")).toBeInTheDocument();
  });

  it("does not enter edit mode when disabled", () => {
    const { props } = makeProps({}, false);
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    expect(screen.queryByLabelText("Expressão LaTeX inline")).not.toBeInTheDocument();
  });

  /**
   * B8 · gatilho G4 — `latex` is `min(1)` in the canonical model, so committing
   * the empty string makes the WHOLE document unrepresentable and the autosave
   * freezes silently. Clearing the field to retype must stay possible, so the
   * empty value lives in the input only.
   */
  it("lets the field be cleared WITHOUT writing an empty latex onto the node", () => {
    const { props, updateAttributes } = makeProps();
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    const input = screen.getByLabelText("Expressão LaTeX inline");

    fireEvent.change(input, { target: { value: "" } });

    // The input really is empty (the user can retype)...
    expect((input as HTMLInputElement).value).toBe("");
    // ...but nothing unrepresentable reached the document.
    expect(updateAttributes).not.toHaveBeenCalled();

    // Typing again commits normally.
    fireEvent.change(input, { target: { value: "z" } });
    expect(updateAttributes).toHaveBeenCalledWith({ latex: "z" });
  });

  it("restores the committed formula when an emptied field loses focus", () => {
    const { props } = makeProps();
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    const input = screen.getByLabelText("Expressão LaTeX inline");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    // The input must not keep claiming the formula is gone when it is not.
    expect((input as HTMLInputElement).value).toBe("x^2");
  });

  it("leaves a non-empty field untouched on blur", () => {
    const { props } = makeProps();
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    const input = screen.getByLabelText("Expressão LaTeX inline");

    fireEvent.change(input, { target: { value: "a+b" } });
    fireEvent.blur(input);

    expect((input as HTMLInputElement).value).toBe("a+b");
  });
  /** Achado 0006 — parity with the read-only `RichTextView`. */
  it("exposes the formula as math with the alt as accessible name", () => {
    const { props } = makeProps({ alt: "x ao quadrado" });
    render(<InlineMathNodeView {...props} />);
    const math = screen.getByTestId("inlinemath-math");
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
    render(<InlineMathNodeView {...props} />);
    const trigger = screen.getByTestId("inlinemath-render");
    expect(trigger).not.toHaveAttribute("role");
    expect(screen.getByRole("button", { name: "Editar fórmula: x ao quadrado" })).toBe(trigger);
  });

  it("falls back to the latex as accessible name when there is no alt", () => {
    const { props } = makeProps({ alt: null });
    render(<InlineMathNodeView {...props} />);
    expect(screen.getByTestId("inlinemath-math")).toHaveAttribute("aria-label", "x^2");
    expect(screen.getByTestId("inlinemath-render")).toHaveAttribute(
      "aria-label",
      "Editar fórmula: x^2",
    );
  });

  /**
   * Achado 0406 — o alvo de clique embrulhava a fórmula num botão com `px-0.5`,
   * somando 2 px de cada lado que o impresso (`RichTextView`, um `<span>` pelado)
   * não tem: o `?` logo depois da fórmula aparecia descolado só no Revisar. O
   * realce pode continuar maior que a fórmula, mas não pode ocupar caixa: todo
   * padding horizontal precisa ser compensado por margem negativa igual.
   */
  it("does not add horizontal box space around the formula", () => {
    const { props } = makeProps();
    render(<InlineMathNodeView {...props} />);
    const classes = screen.getByTestId("inlinemath-render").className.split(/\s+/);

    const spacing = (prefix: string) =>
      classes
        .filter((c) => c.startsWith(prefix))
        .reduce((sum, c) => sum + Number(c.slice(prefix.length)), 0);

    const horizontal =
      spacing("px-") + spacing("pl-") + spacing("pr-") -
      (spacing("-mx-") + spacing("-ml-") + spacing("-mr-"));

    expect(horizontal).toBe(0);
  });

  /**
   * Achado 0006 — without this field the `alt` of an inlineMath is editable
   * nowhere in the UI, so the accessible name above can never be filled in.
   */
  it("edits the alt attr", () => {
    const { props, updateAttributes } = makeProps({ alt: "antigo" });
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    const alt = screen.getByLabelText("Texto alternativo da fórmula inline");
    expect((alt as HTMLInputElement).value).toBe("antigo");

    fireEvent.change(alt, { target: { value: "x ao quadrado" } });
    expect(updateAttributes).toHaveBeenCalledWith({ alt: "x ao quadrado" });

    fireEvent.change(alt, { target: { value: "" } });
    expect(updateAttributes).toHaveBeenCalledWith({ alt: null });
  });
});
