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
});
