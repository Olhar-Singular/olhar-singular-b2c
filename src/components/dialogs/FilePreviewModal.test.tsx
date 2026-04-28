import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import FilePreviewModal from "./FilePreviewModal";

const renderPdfPageMock = vi.fn();
const getPdfPageCountMock = vi.fn();
const createSignedUrlMock = vi.fn();

vi.mock("@/lib/utils/pdf-utils", () => ({
  renderPdfPage: (...a: unknown[]) => renderPdfPageMock(...a),
  getPdfPageCount: (...a: unknown[]) => getPdfPageCountMock(...a),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: (...a: unknown[]) => createSignedUrlMock(...a),
      }),
    },
  },
}));

vi.mock("docx-preview", () => ({ renderAsync: vi.fn().mockResolvedValue(undefined) }));
vi.mock("mammoth", () => ({
  default: {
    convertToHtml: vi.fn().mockResolvedValue({ value: "<p>html</p>" }),
    images: { imgElement: (h: unknown) => h },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  renderPdfPageMock.mockResolvedValue("data:image/jpeg;base64,A");
  getPdfPageCountMock.mockResolvedValue(2);
  createSignedUrlMock.mockResolvedValue({ data: { signedUrl: "https://signed.example/f.docx" } });
});

function pdfFile() {
  return new File([new Uint8Array([0x25])], "doc.pdf", { type: "application/pdf" });
}
function docxFile() {
  return new File([new Uint8Array([0x50])], "doc.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

describe("FilePreviewModal", () => {
  it("does not render when closed", () => {
    render(<FilePreviewModal open={false} onOpenChange={vi.fn()} file={pdfFile()} mode="pdf" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders dialog title with the file name when open", async () => {
    render(<FilePreviewModal open onOpenChange={vi.fn()} file={pdfFile()} mode="pdf" />);
    await waitFor(() => expect(screen.getByText("doc.pdf")).toBeInTheDocument());
  });

  it("renders PDF preview after loading the page", async () => {
    render(<FilePreviewModal open onOpenChange={vi.fn()} file={pdfFile()} mode="pdf" />);
    await waitFor(() => expect(screen.getByText(/Página 1 \/ 2/)).toBeInTheDocument());
  });

  it("logs and recovers when getPdfPageCount throws", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    getPdfPageCountMock.mockRejectedValueOnce(new Error("fail"));
    render(<FilePreviewModal open onOpenChange={vi.fn()} file={pdfFile()} mode="pdf" />);
    await waitFor(() => expect(err).toHaveBeenCalled());
    err.mockRestore();
  });

  it("requests a signed URL when storagePath + docx mode", async () => {
    render(<FilePreviewModal open onOpenChange={vi.fn()} file={docxFile()} mode="docx" storagePath="path/to/file.docx" />);
    await waitFor(() => expect(createSignedUrlMock).toHaveBeenCalledWith("path/to/file.docx", 3600));
  });

  it("does not request signed URL when storagePath is missing in docx mode", async () => {
    render(<FilePreviewModal open onOpenChange={vi.fn()} file={docxFile()} mode="docx" />);
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("renders Download button when a file is provided", async () => {
    render(<FilePreviewModal open onOpenChange={vi.fn()} file={pdfFile()} mode="pdf" />);
    await waitFor(() => screen.getByText("doc.pdf"));
    expect(screen.getByRole("button", { name: /Baixar|Download/i })).toBeInTheDocument();
  });

  it("renders nothing for null file", async () => {
    render(<FilePreviewModal open onOpenChange={vi.fn()} file={null} mode={null} />);
    expect(screen.queryByText(/\.pdf/)).toBeNull();
  });
});
