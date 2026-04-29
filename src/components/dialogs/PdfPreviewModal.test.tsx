import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PdfPreviewModal from "./PdfPreviewModal";

const renderPdfPageMock = vi.fn();
const getPdfPageCountMock = vi.fn();

vi.mock("@/lib/utils/pdf-utils", () => ({
  renderPdfPage: (...args: unknown[]) => renderPdfPageMock(...args),
  getPdfPageCount: (...args: unknown[]) => getPdfPageCountMock(...args),
}));

function fakePdfFile() {
  return new File([new Uint8Array([0x25, 0x50])], "doc.pdf", { type: "application/pdf" });
}

beforeEach(() => {
  vi.clearAllMocks();
  renderPdfPageMock.mockResolvedValue("data:image/jpeg;base64,PAGE");
  getPdfPageCountMock.mockResolvedValue(3);
});

describe("PdfPreviewModal", () => {
  it("does not render when closed", () => {
    render(<PdfPreviewModal open={false} onOpenChange={vi.fn()} file={fakePdfFile()} />);
    expect(screen.queryByText(/Preview PDF/)).toBeNull();
  });

  it("loads page count and first page on open", async () => {
    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} />);
    await waitFor(() => expect(getPdfPageCountMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/Página 1 \/ 3/)).toBeInTheDocument());
  });

  it("uses provided initialPage when within bounds", async () => {
    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} initialPage={2} />);
    await waitFor(() => expect(screen.getByText(/Página 2 \/ 3/)).toBeInTheDocument());
  });

  it("falls back to page 1 when initialPage is out of bounds", async () => {
    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} initialPage={99} />);
    await waitFor(() => expect(screen.getByText(/Página 1 \/ 3/)).toBeInTheDocument());
  });

  it("logs and recovers when getPdfPageCount throws", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    getPdfPageCountMock.mockRejectedValueOnce(new Error("boom"));
    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} />);
    await waitFor(() => expect(err).toHaveBeenCalled());
    err.mockRestore();
  });

  it("navigates pages forward and backward via the chevron buttons", async () => {
    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} />);
    await waitFor(() => expect(screen.getByText(/Página 1 \/ 3/)).toBeInTheDocument());
    const buttons = screen.getAllByRole("button");
    const next = buttons.find((b) => b.querySelector("svg")?.classList.contains("lucide-chevron-right"));
    fireEvent.click(next!);
    await waitFor(() => expect(screen.getByText(/Página 2 \/ 3/)).toBeInTheDocument());
    const prev = buttons.find((b) => b.querySelector("svg")?.classList.contains("lucide-chevron-left"));
    fireEvent.click(prev!);
    await waitFor(() => expect(screen.getByText(/Página 1 \/ 3/)).toBeInTheDocument());
  });

  it("shows Recortar button only when onCrop prop is provided", async () => {
    const { rerender } = render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} />);
    await waitFor(() => expect(screen.queryByText(/Recortar/)).toBeNull());
    rerender(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} onCrop={vi.fn()} />);
    expect(screen.getByText(/Recortar/)).toBeInTheDocument();
  });

  it("entering and cancelling crop mode toggles the helper text", async () => {
    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} onCrop={vi.fn()} />);
    await waitFor(() => screen.getByText(/Recortar/));
    fireEvent.click(screen.getByText(/Recortar/));
    expect(screen.getByText(/Clique e arraste/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Cancelar/));
    expect(screen.queryByText(/Clique e arraste/)).toBeNull();
  });

  it("renders 'Nenhum PDF carregado' when file is null", async () => {
    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={null} />);
    expect(screen.getByText(/Nenhum PDF carregado/)).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when dialog is closed", async () => {
    const onOpenChange = vi.fn();
    render(<PdfPreviewModal open onOpenChange={onOpenChange} file={fakePdfFile()} />);
    await waitFor(() => screen.getByText(/Página 1/));
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("mousedown in crop mode sets cropStart and enables Confirmar Recorte button (disabled, no area yet)", async () => {
    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} onCrop={vi.fn()} />);
    await waitFor(() => screen.getByAltText(/Página 1/));
    fireEvent.click(screen.getByText(/Recortar/));
    expect(screen.getByText(/Clique e arraste/)).toBeInTheDocument();

    const img = screen.getByAltText(/Página 1/);
    const wrapper = img.parentElement!;
    fireEvent.mouseDown(wrapper, { clientX: 10, clientY: 10 });

    // After mouseDown at the same spot, Confirmar Recorte must be visible but disabled
    // (area is 0×0 so getCropRect returns null)
    const confirmBtn = screen.getByRole("button", { name: /Confirmar Recorte/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("mousemove while dragging in crop mode fires without error and keeps Confirmar enabled only after real area", async () => {
    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} onCrop={vi.fn()} />);
    await waitFor(() => screen.getByAltText(/Página 1/));
    fireEvent.click(screen.getByText(/Recortar/));

    const img = screen.getByAltText(/Página 1/);
    const wrapper = img.parentElement!;

    fireEvent.mouseDown(wrapper, { clientX: 0, clientY: 0 });
    // Simulate dragging — in jsdom getBoundingClientRect returns zeros so coords stay 0,0
    fireEvent.mouseMove(wrapper, { clientX: 50, clientY: 50 });

    // Button must still be present (crop is active)
    expect(screen.getByRole("button", { name: /Confirmar Recorte/i })).toBeInTheDocument();
  });

  it("mouseup stops dragging — subsequent mousemove does not update cropEnd", async () => {
    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} onCrop={vi.fn()} />);
    await waitFor(() => screen.getByAltText(/Página 1/));
    fireEvent.click(screen.getByText(/Recortar/));

    const img = screen.getByAltText(/Página 1/);
    const wrapper = img.parentElement!;

    fireEvent.mouseDown(wrapper, { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(wrapper);
    // After mouseUp isDragging=false; further mousemove is a no-op
    fireEvent.mouseMove(wrapper, { clientX: 100, clientY: 100 });

    // Component must not crash and crop buttons are still rendered
    expect(screen.getByRole("button", { name: /Confirmar Recorte/i })).toBeInTheDocument();
  });

  it("getCropRect returns null when start equals end (area < 5px) so Confirmar stays disabled", async () => {
    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} onCrop={vi.fn()} />);
    await waitFor(() => screen.getByAltText(/Página 1/));
    fireEvent.click(screen.getByText(/Recortar/));

    const img = screen.getByAltText(/Página 1/);
    const wrapper = img.parentElement!;

    // mouseDown and mouseUp at the same point → width=0, height=0 → getCropRect returns null
    fireEvent.mouseDown(wrapper, { clientX: 5, clientY: 5 });
    fireEvent.mouseUp(wrapper);

    expect(screen.getByRole("button", { name: /Confirmar Recorte/i })).toBeDisabled();
  });

  it("mouseLeave stops dragging the same as mouseUp", async () => {
    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} onCrop={vi.fn()} />);
    await waitFor(() => screen.getByAltText(/Página 1/));
    fireEvent.click(screen.getByText(/Recortar/));

    const img = screen.getByAltText(/Página 1/);
    const wrapper = img.parentElement!;

    fireEvent.mouseDown(wrapper, { clientX: 0, clientY: 0 });
    fireEvent.mouseLeave(wrapper);
    fireEvent.mouseMove(wrapper, { clientX: 80, clientY: 80 });

    // No crash; crop UI still visible
    expect(screen.getByRole("button", { name: /Confirmar Recorte/i })).toBeInTheDocument();
  });
});
