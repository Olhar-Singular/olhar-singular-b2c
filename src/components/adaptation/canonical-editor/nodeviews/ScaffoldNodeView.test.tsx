import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import { ScaffoldNodeView } from "./ScaffoldNodeView";
import { DEFAULT_INK } from "@/components/adaptation/render/pageTokens";

vi.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...rest }: { children: React.ReactNode }) => <div {...rest}>{children}</div>,
}));

function makeProps(items: string[], editable = true) {
  const updateAttributes = vi.fn();
  const deleteNode = vi.fn();
  const props = {
    node: { attrs: { items } },
    updateAttributes,
    deleteNode,
    editor: { isEditable: editable },
  } as unknown as NodeViewProps;
  return { props, updateAttributes, deleteNode };
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

  // "Andaime" is the pedagogical jargon for this block; the teacher reading
  // the sheet needs a word that says what it does. Since 0155 the label is
  // document text, not editor chrome: ScaffoldingView and PdfScaffolding print
  // the same SCAFFOLDING_LABEL on top of the box, so the student's exam gets a
  // named support box instead of an anonymous beige rectangle.
  it("labels the block 'Apoio', not the jargon", () => {
    const { props } = makeProps(["a"]);
    render(<ScaffoldNodeView {...props} />);
    expect(screen.getByText("Apoio")).toBeInTheDocument();
    expect(screen.queryByText(/andaime/i)).not.toBeInTheDocument();
  });

  it("calls deleteNode when the delete button is clicked", () => {
    const { props, deleteNode } = makeProps(["a"]);
    render(<ScaffoldNodeView {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir apoio" }));
    expect(deleteNode).toHaveBeenCalledTimes(1);
  });

  it("disables the delete button when not editable", () => {
    const { props } = makeProps(["a"], false);
    render(<ScaffoldNodeView {...props} />);
    expect(screen.getByRole("button", { name: "Excluir apoio" })).toBeDisabled();
  });
});

// O rótulo e os ordinais dos passos são texto do DOCUMENTO desde o 0155 (as
// duas superfícies impressas os desenham na tinta do corpo). Na folha do
// Revisar eles ainda saíam no token de chrome apagado `--sf-ink-faint`
// (rgb(171,165,155), 2,21:1 sobre o bege da caixa, abaixo dos 4,5:1 da WCAG
// 1.4.3): o professor decidia se o andaime tem destaque olhando um rótulo que
// quase não se lê, e o aluno recebia um título cheio (achado 0160).
describe("ScaffoldNodeView — tinta do documento no que é impresso", () => {
  /** `DEFAULT_INK` em hex; o jsdom normaliza `style.color` para `rgb(...)`. */
  const inkAsRgb = (() => {
    const probe = document.createElement("div");
    probe.style.color = DEFAULT_INK;
    return probe.style.color;
  })();

  it("pinta o rótulo com a tinta do corpo, não com o chrome apagado", () => {
    const { props } = makeProps(["a"]);
    render(<ScaffoldNodeView {...props} />);
    const label = screen.getByTestId("scaffold-label");
    expect(label.style.color).toBe(inkAsRgb);
    expect(label.className).not.toMatch(/ink-faint/);
  });

  it("pinta o ordinal do passo na tinta e no tamanho do documento", () => {
    const { props } = makeProps(["a", "b"]);
    render(<ScaffoldNodeView {...props} />);
    const ordinal = screen.getByTestId("scaffold-step-ordinal-0");
    expect(ordinal).toHaveTextContent("1.");
    expect(ordinal.style.color).toBe(inkAsRgb);
    expect(ordinal.className).not.toMatch(/ink-faint/);
    expect(ordinal.className).not.toMatch(/text-xs/);
  });
});
