import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import type { ImageItem } from "@/components/editor/imageManagerUtils";
import { ImageNodeView } from "./ImageNodeView";

vi.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...rest }: { children: React.ReactNode }) => <div {...rest}>{children}</div>,
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
});

describe("ImageNodeView", () => {
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

  it("edits caption and alt", () => {
    const { props, updateAttributes } = makeProps({ caption: [{ type: "text", text: "cap" }] });
    render(<ImageNodeView {...props} />);
    fireEvent.change(screen.getByLabelText("Legenda da imagem"), { target: { value: "new" } });
    fireEvent.change(screen.getByLabelText("Texto alternativo"), { target: { value: "altx" } });
    expect(updateAttributes).toHaveBeenCalledWith({ caption: [{ type: "text", text: "new" }] });
    expect(updateAttributes).toHaveBeenCalledWith({ alt: "altx" });
  });

  it("sets a caption when there was none (null caption maps to undefined existing)", () => {
    const { props, updateAttributes } = makeProps({ caption: null });
    render(<ImageNodeView {...props} />);
    fireEvent.change(screen.getByLabelText("Legenda da imagem"), { target: { value: "first" } });
    expect(updateAttributes).toHaveBeenCalledWith({ caption: [{ type: "text", text: "first" }] });
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
});
