import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExportPanel } from "./ExportPanel";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import type { PanelSettings } from "./panelSettings";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const document: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    { id: id(1), type: "paragraph", content: [{ type: "text", text: "olá mundo" }] },
    {
      id: id(2),
      type: "question",
      number: 1,
      stem: [{ id: id(3), type: "paragraph", content: [{ type: "text", text: "q1" }] }],
      answer: { kind: "open" },
    },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe("ExportPanel", () => {
  it("copies the plain-text projection", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { toast } = await import("sonner");
    render(<ExportPanel document={document} onDownload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Copiar/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Copiado para a área de transferência!"));
  });

  it("shows an error toast when copy fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    const { toast } = await import("sonner");
    render(<ExportPanel document={document} onDownload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Copiar/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Erro ao copiar."));
  });

  it("builds the PDF with header, font and page-break settings from the inputs", async () => {
    const onDownload = vi.fn<(d: CanonicalDocument, s: PanelSettings) => Promise<void>>().mockResolvedValue(undefined);
    const { toast } = await import("sonner");
    render(<ExportPanel document={document} onDownload={onDownload} />);

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Minha Prova" } });
    fireEvent.change(screen.getByLabelText("Escola"), { target: { value: "Escola X" } });
    fireEvent.change(screen.getByLabelText("Professor(a)"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-06-04" } });
    fireEvent.change(screen.getByLabelText("Fonte"), { target: { value: "Times-Roman" } });
    fireEvent.click(screen.getByRole("switch"));

    fireEvent.click(screen.getByRole("button", { name: /Exportar PDF/i }));

    await waitFor(() => expect(onDownload).toHaveBeenCalled());
    const [doc, settings] = onDownload.mock.calls[0];
    expect(doc).toBe(document);
    expect(settings).toEqual({
      header: { title: "Minha Prova", school: "Escola X", teacher: "Ana", date: "2026-06-04" },
      fontFamily: "Times-Roman",
      pageBreakPerQuestion: true,
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("PDF gerado!"));
  });

  it("shows an error toast when the export fails", async () => {
    const onDownload = vi.fn().mockRejectedValue(new Error("boom"));
    const { toast } = await import("sonner");
    render(<ExportPanel document={document} onDownload={onDownload} />);
    fireEvent.click(screen.getByRole("button", { name: /Exportar PDF/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Erro ao gerar PDF."));
  });

  it("defaults to the downloadPdf trigger when no override is given", () => {
    render(<ExportPanel document={document} />);
    expect(screen.getByRole("button", { name: /Exportar PDF/i })).toBeInTheDocument();
  });
});
