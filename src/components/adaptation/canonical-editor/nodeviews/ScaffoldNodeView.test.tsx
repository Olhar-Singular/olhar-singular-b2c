import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import { ScaffoldNodeView } from "./ScaffoldNodeView";

vi.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...rest }: { children: React.ReactNode }) => <div {...rest}>{children}</div>,
}));

function makeProps(items: string[], editable = true) {
  const updateAttributes = vi.fn();
  const props = {
    node: { attrs: { items } },
    updateAttributes,
    editor: { isEditable: editable },
  } as unknown as NodeViewProps;
  return { props, updateAttributes };
}

beforeEach(() => vi.clearAllMocks());

describe("ScaffoldNodeView", () => {
  it("edits, removes and adds steps", () => {
    const { props, updateAttributes } = makeProps(["a", "b"]);
    render(<ScaffoldNodeView {...props} />);
    fireEvent.change(screen.getByLabelText("Passo 1"), { target: { value: "A" } });
    fireEvent.click(screen.getAllByTitle("Remover passo")[0]);
    fireEvent.click(screen.getByText("Passo"));
    expect(updateAttributes).toHaveBeenCalledWith({ items: ["A", "b"] });
    expect(updateAttributes).toHaveBeenCalledWith({ items: ["b"] });
    expect(updateAttributes).toHaveBeenCalledWith({ items: ["a", "b", ""] });
  });

  it("disables inputs when not editable", () => {
    const { props } = makeProps(["a"], false);
    render(<ScaffoldNodeView {...props} />);
    expect(screen.getByLabelText("Passo 1")).toBeDisabled();
  });
});
