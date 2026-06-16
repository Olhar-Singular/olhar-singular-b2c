import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import type { ImageItem } from "@/components/editor/imageManagerUtils";
import { ImageNodeView } from "./ImageNodeView";

vi.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...rest }: { children: React.ReactNode }) => <div {...rest}>{children}</div>,
}));

// Stub the inline rich-text field used for the caption; emit a single text run
// (or empty array) on change so we can drive the caption without the real editor.
let captionInitialValue: unknown;
vi.mock("../RichTextField", () => ({
  RichTextField: ({
    value,
    onChange,
    ariaLabel,
    disabled,
  }: {
    value: { type: "text"; text: string }[];
    onChange: (rt: { type: "text"; text: string }[]) => void;
    ariaLabel?: string;
    disabled?: boolean;
  }) => {
    captionInitialValue = value;
    const initialText = value.map((n) => n.text).join("");
    return (
      <input
        aria-label={ariaLabel}
        disabled={disabled}
        defaultValue={initialText}
        onChange={(e) => onChange(e.target.value === "" ? [] : [{ type: "text", text: e.target.value }])}
      />
    );
  },
}));

vi.mock("@/components/editor/ImageResizer", () => ({
  default: ({ onResize }: { onResize: (w: number) => void }) => (
    <button data-testid="resizer" onClick={() => onResize(123)}>resizer</button>
  ),
}));

let modalOnConfirm: ((images: ImageItem[]) => void) | undefined;
let modalOnClose: (() => void) | undefined;
vi.mock("@/components/editor/ImageManagerModal", () => ({
  default: ({ open, onConfirm, onClose }: { open: boolean; onConfirm: (images: ImageItem[]) => void; onClose: () => void }) => {
    modalOnConfirm = onConfirm;
    modalOnClose = onClose;
    return open ? <button data-testid="image-modal" onClick={onClose}>modal</button> : null;
  },
}));

function makeProps(attrs: Record<string, unknown> = {}, editable = true) {
  const updateAttributes = vi.fn();
  const props = {
    node: { attrs: { src: "x.png", alt: "", width: null, alignment: null, caption: null, ...attrs } },
    updateAttributes,
    editor: { isEditable: editable },
  } as unknown as NodeViewProps;
  return { props, updateAttributes };
}

beforeEach(() => {
  vi.clearAllMocks();
  modalOnConfirm = undefined;
  modalOnClose = undefined;
  captionInitialValue = undefined;
});

function renderImage(attrs: Record<string, unknown> = {}, editable = true) {
  const { props } = makeProps(attrs, editable);
  return render(<ImageNodeView {...props} />);
}

describe("ImageNodeView", () => {
  it("container da imagem é flat (sem borda de card)", () => {
    const { getByTestId } = renderImage();
    expect(getByTestId("image-node").className).not.toMatch(/rounded-xl|border border-border\/60/);
  });

  it("updates width on resize", () => {
    const { props, updateAttributes } = makeProps();
    render(<ImageNodeView {...props} />);
    fireEvent.click(screen.getByTestId("resizer"));
    expect(updateAttributes).toHaveBeenCalledWith({ width: 123 });
  });

  it("updates alignment", () => {
    const { props, updateAttributes } = makeProps({ alignment: "left" });
    render(<ImageNodeView {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Centralizar" }));
    expect(updateAttributes).toHaveBeenCalledWith({ alignment: "center" });
  });

  it("edits caption (rich text) and alt", () => {
    const { props, updateAttributes } = makeProps({ caption: [{ type: "text", text: "cap" }] });
    render(<ImageNodeView {...props} />);
    // RichTextField is seeded with the caption RichText.
    expect(captionInitialValue).toEqual([{ type: "text", text: "cap" }]);
    fireEvent.change(screen.getByLabelText("Legenda da imagem"), { target: { value: "new" } });
    fireEvent.change(screen.getByLabelText("Texto alternativo"), { target: { value: "altx" } });
    expect(updateAttributes).toHaveBeenCalledWith({ caption: [{ type: "text", text: "new" }] });
    expect(updateAttributes).toHaveBeenCalledWith({ alt: "altx" });
  });

  it("seeds the caption field with an empty array when caption is null", () => {
    const { props } = makeProps({ caption: null });
    render(<ImageNodeView {...props} />);
    expect(captionInitialValue).toEqual([]);
  });

  it("sets a caption when there was none", () => {
    const { props, updateAttributes } = makeProps({ caption: null });
    render(<ImageNodeView {...props} />);
    fireEvent.change(screen.getByLabelText("Legenda da imagem"), { target: { value: "first" } });
    expect(updateAttributes).toHaveBeenCalledWith({ caption: [{ type: "text", text: "first" }] });
  });

  it("clears the caption to null when emptied", () => {
    const { props, updateAttributes } = makeProps({ caption: [{ type: "text", text: "cap" }] });
    render(<ImageNodeView {...props} />);
    fireEvent.change(screen.getByLabelText("Legenda da imagem"), { target: { value: "" } });
    expect(updateAttributes).toHaveBeenCalledWith({ caption: null });
  });

  it("opens the modal and applies the first picked image", () => {
    const { props, updateAttributes } = makeProps();
    render(<ImageNodeView {...props} />);
    fireEvent.click(screen.getByText("Trocar imagem"));
    expect(screen.getByTestId("image-modal")).toBeInTheDocument();
    modalOnConfirm?.([{ id: "a", src: "new.png", align: "right" }]);
    expect(updateAttributes).toHaveBeenCalledWith({ src: "new.png", alignment: "right" });
  });

  it("closes the modal via onClose", () => {
    const { props } = makeProps();
    render(<ImageNodeView {...props} />);
    fireEvent.click(screen.getByText("Trocar imagem"));
    expect(screen.getByTestId("image-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("image-modal"));
    expect(screen.queryByTestId("image-modal")).not.toBeInTheDocument();
    expect(modalOnClose).toBeTypeOf("function");
  });

  it("ignores an empty pick", () => {
    const { props, updateAttributes } = makeProps();
    render(<ImageNodeView {...props} />);
    modalOnConfirm?.([]);
    expect(updateAttributes).not.toHaveBeenCalled();
  });

  it("disables controls when not editable", () => {
    const { props } = makeProps({}, false);
    render(<ImageNodeView {...props} />);
    expect(screen.getByLabelText("Texto alternativo")).toBeDisabled();
  });

  it("sempre mostra os controles de alinhamento + trocar imagem (superfície única)", () => {
    const { props } = makeProps({ alignment: "left" });
    render(<ImageNodeView {...props} />);
    expect(screen.getByRole("button", { name: "Alinhar à esquerda" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Centralizar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alinhar à direita" })).toBeInTheDocument();
    expect(screen.getByText("Trocar imagem")).toBeInTheDocument();
  });
});
