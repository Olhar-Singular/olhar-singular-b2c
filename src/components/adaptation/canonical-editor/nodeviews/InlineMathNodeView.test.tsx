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
});
