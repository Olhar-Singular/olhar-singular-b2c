import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import type { ImageItem } from "@/components/editor/imageManagerUtils";
import { ImageNodeView } from "./ImageNodeView";

vi.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...rest }: { children: React.ReactNode }) => <div {...rest}>{children}</div>,
}));

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
    const initialText = value.filter((n) => n.type === "text").map((n) => n.text).join("");
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

let cropOnCrop: ((dataUrl: string) => void) | undefined;
vi.mock("@/components/forms/PdfPreviewModal", () => ({
  default: ({ open, onCrop, file }: { open: boolean; onCrop: (dataUrl: string) => void; file: File | null }) => {
    cropOnCrop = onCrop;
    return open ? <div data-testid="crop-modal">{file?.name}</div> : null;
  },
}));

const uploadImageDataUrlMock = vi.fn();
vi.mock("@/lib/utils/imageUpload", () => ({
  uploadImageDataUrl: (...a: unknown[]) => uploadImageDataUrlMock(...a),
}));

const toastErrorMock = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastErrorMock(...a) } }));

function makeProps(
  attrs: Record<string, unknown> = {},
  editable = true,
  uploadedExam: { file: File | null; userId?: string | null } = { file: null },
) {
  const updateAttributes = vi.fn();
  const deleteNode = vi.fn();
  const props = {
    node: { attrs: { src: "x.png", alt: "", width: null, alignment: null, caption: null, ...attrs } },
    updateAttributes,
    deleteNode,
    editor: {
      isEditable: editable,
      storage: { uploadedExam: { file: uploadedExam.file, pageImages: [], userId: uploadedExam.userId ?? "user-1" } },
    },
  } as unknown as NodeViewProps;
  return { props, updateAttributes, deleteNode };
}

function pdfFile(name = "prova.pdf") {
  return new File(["pdf-bytes"], name, { type: "application/pdf" });
}

beforeEach(() => {
  vi.clearAllMocks();
  modalOnConfirm = undefined;
  modalOnClose = undefined;
  cropOnCrop = undefined;
  uploadImageDataUrlMock.mockResolvedValue("https://bucket.example/cropped.png");
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

  it("mostra botão 'Excluir imagem' na barra de controles", () => {
    renderImage();
    expect(screen.getByRole("button", { name: "Excluir imagem" })).toBeInTheDocument();
  });

  it("clicar 'Excluir imagem' chama deleteNode", () => {
    const { props, deleteNode } = makeProps();
    render(<ImageNodeView {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir imagem" }));
    expect(deleteNode).toHaveBeenCalledOnce();
  });

  it("botão 'Excluir imagem' fica desabilitado quando não editável", () => {
    renderImage({}, false);
    expect(screen.getByRole("button", { name: "Excluir imagem" })).toBeDisabled();
  });

  it("sem campo de texto alternativo (removido)", () => {
    renderImage();
    expect(screen.queryByLabelText("Texto alternativo")).not.toBeInTheDocument();
  });

  it("controles de edição ficam dentro do wrapper image-controls", () => {
    const { getByTestId } = renderImage();
    expect(getByTestId("image-controls")).toBeInTheDocument();
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

  it("sempre mostra os controles de alinhamento + trocar imagem", () => {
    const { props } = makeProps({ alignment: "left" });
    render(<ImageNodeView {...props} />);
    expect(screen.getByRole("button", { name: "Alinhar à esquerda" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Centralizar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alinhar à direita" })).toBeInTheDocument();
    expect(screen.getByText("Trocar imagem")).toBeInTheDocument();
  });

  // --- Legenda: toggle -------------------------------------------------------

  it("mostra botão adicionar legenda quando caption é null", () => {
    renderImage({ caption: null });
    expect(screen.getByRole("button", { name: "Adicionar legenda" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Legenda da imagem")).not.toBeInTheDocument();
  });

  it("clicar adicionar legenda chama updateAttributes com array vazio", () => {
    const { props, updateAttributes } = makeProps({ caption: null });
    render(<ImageNodeView {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar legenda" }));
    expect(updateAttributes).toHaveBeenCalledWith({ caption: [] });
  });

  it("mostra campo legenda e botão remover quando caption é array vazio", () => {
    renderImage({ caption: [] });
    expect(screen.queryByRole("button", { name: "Adicionar legenda" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Legenda da imagem")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover legenda" })).toBeInTheDocument();
  });

  it("mostra campo legenda e botão remover quando caption tem conteúdo", () => {
    renderImage({ caption: [{ type: "text", text: "cap" }] });
    expect(screen.queryByRole("button", { name: "Adicionar legenda" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Legenda da imagem")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover legenda" })).toBeInTheDocument();
  });

  it("clicar remover legenda chama updateAttributes com null", () => {
    const { props, updateAttributes } = makeProps({ caption: [{ type: "text", text: "cap" }] });
    render(<ImageNodeView {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover legenda" }));
    expect(updateAttributes).toHaveBeenCalledWith({ caption: null });
  });

  it("edita conteúdo da legenda quando caption não é null", () => {
    const { props, updateAttributes } = makeProps({ caption: [{ type: "text", text: "cap" }] });
    render(<ImageNodeView {...props} />);
    fireEvent.change(screen.getByLabelText("Legenda da imagem"), { target: { value: "nova" } });
    expect(updateAttributes).toHaveBeenCalledWith({ caption: [{ type: "text", text: "nova" }] });
  });

  it("onChange da legenda preserva array vazio (não anula a seção)", () => {
    const { props, updateAttributes } = makeProps({ caption: [{ type: "text", text: "cap" }] });
    render(<ImageNodeView {...props} />);
    fireEvent.change(screen.getByLabelText("Legenda da imagem"), { target: { value: "" } });
    expect(updateAttributes).toHaveBeenCalledWith({ caption: [] });
  });

  it("desabilita controles quando não editável", () => {
    renderImage({}, false);
    expect(screen.getByRole("button", { name: "Adicionar legenda" })).toBeDisabled();
  });

  // --- Modal ----------------------------------------------------------------

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

  // --- Alignment container --------------------------------------------------

  it("aplica justify-center ao container quando alignment é center", () => {
    const { getByTestId } = renderImage({ alignment: "center" });
    expect(getByTestId("image-align-container").className).toContain("justify-center");
  });

  it("aplica justify-end ao container quando alignment é right", () => {
    const { getByTestId } = renderImage({ alignment: "right" });
    expect(getByTestId("image-align-container").className).toContain("justify-end");
  });

  it("sem classe de alinhamento direcional quando alignment é left", () => {
    const { getByTestId } = renderImage({ alignment: "left" });
    expect(getByTestId("image-align-container").className).not.toContain("justify-center");
    expect(getByTestId("image-align-container").className).not.toContain("justify-end");
  });

  it("sem classe de alinhamento direcional quando alignment é null", () => {
    const { getByTestId } = renderImage({ alignment: null });
    expect(getByTestId("image-align-container").className).not.toContain("justify-center");
    expect(getByTestId("image-align-container").className).not.toContain("justify-end");
  });

  // --- Recortar do original (Adaptar direto do arquivo only) ----------------

  describe("Recortar do original", () => {
    it("hides the button when there is no uploaded exam (Banco de Questões adaptations)", () => {
      renderImage();
      expect(screen.queryByText("Recortar do original")).not.toBeInTheDocument();
    });

    it("hides the button for a DOCX-originated upload — crop tool is PDF-only", () => {
      const docxFile = new File(["x"], "prova.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const { props } = makeProps({}, true, { file: docxFile });
      render(<ImageNodeView {...props} />);
      expect(screen.queryByText("Recortar do original")).not.toBeInTheDocument();
    });

    it("shows and opens the crop modal for a PDF-originated upload", () => {
      const file = pdfFile();
      const { props } = makeProps({}, true, { file });
      render(<ImageNodeView {...props} />);
      expect(screen.queryByTestId("crop-modal")).not.toBeInTheDocument();
      fireEvent.click(screen.getByText("Recortar do original"));
      expect(screen.getByTestId("crop-modal")).toHaveTextContent("prova.pdf");
    });

    it("disables the button when not editable", () => {
      const { props } = makeProps({}, false, { file: pdfFile() });
      render(<ImageNodeView {...props} />);
      expect(screen.getByRole("button", { name: /Recortar do original/i })).toBeDisabled();
    });

    it("uploads the cropped data URL and updates src on success", async () => {
      const { props, updateAttributes } = makeProps({}, true, { file: pdfFile() });
      render(<ImageNodeView {...props} />);
      fireEvent.click(screen.getByText("Recortar do original"));
      cropOnCrop?.("data:image/png;base64,CROPPED");
      await waitFor(() => expect(updateAttributes).toHaveBeenCalledWith({ src: "https://bucket.example/cropped.png" }));
      expect(uploadImageDataUrlMock).toHaveBeenCalledWith("data:image/png;base64,CROPPED", "user-1");
    });

    it("shows an error toast and does not touch src when the upload fails", async () => {
      uploadImageDataUrlMock.mockResolvedValueOnce(null);
      const { props, updateAttributes } = makeProps({}, true, { file: pdfFile() });
      render(<ImageNodeView {...props} />);
      fireEvent.click(screen.getByText("Recortar do original"));
      cropOnCrop?.("data:image/png;base64,CROPPED");
      await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
      expect(updateAttributes).not.toHaveBeenCalledWith(expect.objectContaining({ src: expect.anything() }));
    });
  });
});
