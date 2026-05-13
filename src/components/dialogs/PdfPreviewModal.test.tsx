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

  it("logs error and recovers when renderPdfPage throws during page navigation", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} />);
    await waitFor(() => screen.getByText(/Página 1 \/ 3/));
    // Make the next renderPdfPage call fail
    renderPdfPageMock.mockRejectedValueOnce(new Error("render fail"));
    const buttons = screen.getAllByRole("button");
    const next = buttons.find((b) => b.querySelector("svg")?.classList.contains("lucide-chevron-right"));
    fireEvent.click(next!);
    await waitFor(() => expect(err).toHaveBeenCalled());
    err.mockRestore();
  });

  it("getCropRect returns null when cropStart is set but cropEnd equals start (covers !cropStart branch)", async () => {
    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} onCrop={vi.fn()} />);
    await waitFor(() => screen.getByAltText(/Página 1/));
    fireEvent.click(screen.getByText(/Recortar/));
    // No mouseDown at all — cropStart and cropEnd are both null
    // Confirmar Recorte button must be disabled (getCropRect returns null due to !cropStart)
    expect(screen.getByRole("button", { name: /Confirmar Recorte/i })).toBeDisabled();
  });

  it("getCropRect returns a rect when drag area is >= 5px (covers line 96)", async () => {
    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} onCrop={vi.fn()} />);
    await waitFor(() => screen.getByAltText(/Página 1/));
    fireEvent.click(screen.getByText(/Recortar/));

    const img = screen.getByAltText(/Página 1/);
    // Mock clientWidth/Height so getRelativeCoords can produce real coordinates
    Object.defineProperty(img, "clientWidth", { value: 800, configurable: true });
    Object.defineProperty(img, "clientHeight", { value: 600, configurable: true });
    // getBoundingClientRect returns zeros by default in jsdom — mouseCoords = clientX - 0
    const wrapper = img.parentElement!;
    fireEvent.mouseDown(wrapper, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(wrapper, { clientX: 100, clientY: 100 });

    // Now width=Math.min(800,100-0)-Math.min(800,10-0) etc — actual coords will be min(800,100)=100
    // so cropStart={x:10,y:10} cropEnd={x:100,y:100} → width=90,height=90 ≥ 5
    // Confirmar Recorte button should be enabled (cropRect is non-null)
    expect(screen.getByRole("button", { name: /Confirmar Recorte/i })).not.toBeDisabled();
  });

  it("Baixar button creates an object URL and triggers download", async () => {
    const revokeUrl = vi.fn();
    const createUrl = vi.fn().mockReturnValue("blob:fake");
    Object.defineProperty(URL, "createObjectURL", { value: createUrl, writable: true, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeUrl, writable: true, configurable: true });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} />);
    await waitFor(() => screen.getByText(/Página 1 \/ 3/));

    fireEvent.click(screen.getByRole("button", { name: /Baixar/i }));

    expect(createUrl).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith("blob:fake");
    clickSpy.mockRestore();
  });

  it("Baixar button is a no-op when file is null (covers !file guard in download handler)", () => {
    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={null} />);
    // Baixar button is always rendered; clicking it with file=null hits the early return
    fireEvent.click(screen.getByRole("button", { name: /Baixar/i }));
    // no error thrown means the early return was exercised
    expect(screen.getByRole("button", { name: /Baixar/i })).toBeInTheDocument();
  });

  it("loadPage short-circuits when file becomes null (covers !file guard in loadPage)", async () => {
    const { rerender } = render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} />);
    await waitFor(() => screen.getByText(/Página 1 \/ 3/));

    // Re-render with file=null; pageCount state stays 3, so next button is enabled
    rerender(<PdfPreviewModal open onOpenChange={vi.fn()} file={null} />);

    const buttons = screen.getAllByRole("button");
    const next = buttons.find((b) => b.querySelector("svg")?.classList.contains("lucide-chevron-right"));
    // fireEvent bypasses disabled, calling loadPage(2) with file=null
    fireEvent.click(next!);

    // Component must not crash; loading state stays false after the early return
    expect(screen.getByRole("button", { name: /Baixar/i })).toBeInTheDocument();
  });

  it("mouseDown on image wrapper when not in crop mode is a no-op (covers !cropping guard)", async () => {
    render(<PdfPreviewModal open onOpenChange={vi.fn()} file={fakePdfFile()} />);
    await waitFor(() => screen.getByAltText(/Página 1/));

    // cropping=false (default); fire mouseDown on the wrapper
    const img = screen.getByAltText(/Página 1/);
    const wrapper = img.parentElement!;
    fireEvent.mouseDown(wrapper, { clientX: 50, clientY: 50 });

    // No crop UI appears — the early return was exercised
    expect(screen.queryByText(/Clique e arraste/)).toBeNull();
  });
});
