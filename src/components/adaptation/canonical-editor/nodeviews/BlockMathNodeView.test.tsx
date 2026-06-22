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
});
