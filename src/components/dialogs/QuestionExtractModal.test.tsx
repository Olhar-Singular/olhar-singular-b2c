import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import QuestionExtractModal from "./QuestionExtractModal";

const invokeSpy = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeSpy(...args) },
  },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/utils/fileValidation", () => ({
  validatePdfMagicBytes: vi.fn().mockReturnValue(true),
  validateImageMagicBytes: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/domain/questionParser", () => ({
  validateExtractedQuestions: (q: unknown[]) => q,
}));

vi.mock("@/lib/utils/pdf-utils", () => ({
  parsePdf: vi.fn().mockResolvedValue({ text: "x", pageImages: [], pageCount: 1, pagesProcessed: [1] }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  invokeSpy.mockResolvedValue({ data: { questions: [{ text: "Q1", subject: "Física" }] }, error: null });
});

function pdfFile() {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "doc.pdf", { type: "application/pdf" });
}
function bigFile() {
  const big = new Uint8Array(21 * 1024 * 1024);
  return new File([big], "doc.pdf", { type: "application/pdf" });
}
function txtFile() {
  return new File(["hello"], "doc.txt", { type: "text/plain" });
}

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  onExtracted: vi.fn(),
  creditBalance: 50,
  freeExtractionUsed: false,
  refreshProfile: vi.fn().mockResolvedValue(undefined),
};

describe("QuestionExtractModal — render", () => {
  it("does not render when closed", () => {
    render(<QuestionExtractModal {...baseProps} open={false} />);
    expect(screen.queryByText(/Extrair Quest/)).toBeNull();
  });

  it("shows the upload step on open", () => {
    render(<QuestionExtractModal {...baseProps} />);
    expect(screen.getAllByText(/Extrair Quest/i).length).toBeGreaterThan(0);
  });

  it("shows the free badge when free extraction is available", () => {
    render(<QuestionExtractModal {...baseProps} />);
    expect(screen.getByText(/Gratuita|Grátis/i)).toBeInTheDocument();
  });

  it("shows credit cost when free is used and balance is sufficient", () => {
    render(<QuestionExtractModal {...baseProps} freeExtractionUsed creditBalance={10} />);
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });
});

describe("QuestionExtractModal — file validation", () => {
  it("rejects unsupported file types", async () => {
    render(<QuestionExtractModal {...baseProps} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [txtFile()], writable: false });
    fireEvent.change(input);
    await waitFor(() => expect(screen.getByText(/Formato não suportado/i)).toBeInTheDocument());
  });

  it("rejects files larger than 20 MB", async () => {
    render(<QuestionExtractModal {...baseProps} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [bigFile()], writable: false });
    fireEvent.change(input);
    await waitFor(() => expect(screen.getByText(/Arquivo muito grande/i)).toBeInTheDocument());
  });

  it("transitions to confirm step after a valid PDF is selected", async () => {
    render(<QuestionExtractModal {...baseProps} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [pdfFile()], writable: false });
    fireEvent.change(input);
    await waitFor(() => expect(screen.getByText(/doc\.pdf/)).toBeInTheDocument());
  });
});

describe("QuestionExtractModal — extract flow", () => {
  it("invokes extract-questions and forwards extracted questions on success", async () => {
    const onExtracted = vi.fn();
    render(<QuestionExtractModal {...baseProps} onExtracted={onExtracted} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [pdfFile()], writable: false });
    fireEvent.change(input);
    await waitFor(() => screen.getByText(/doc\.pdf/));
    const extractBtn = screen.getByRole("button", { name: /Extrair/i });
    fireEvent.click(extractBtn);
    await waitFor(() => expect(invokeSpy).toHaveBeenCalledWith("extract-questions", expect.anything()));
    await waitFor(() => expect(onExtracted).toHaveBeenCalled());
  });

  it("toasts error when invoke returns 402 (insufficient credits)", async () => {
    const { toast } = await import("sonner");
    invokeSpy.mockResolvedValue({
      data: { balance: 0 },
      error: { context: { status: 402 }, message: "no credits" },
    });
    render(<QuestionExtractModal {...baseProps} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [pdfFile()], writable: false });
    fireEvent.change(input);
    await waitFor(() => screen.getByText(/doc\.pdf/));
    fireEvent.click(screen.getByRole("button", { name: /Extrair/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("toasts when zero questions are extracted", async () => {
    const { toast } = await import("sonner");
    invokeSpy.mockResolvedValue({ data: { questions: [] }, error: null });
    render(<QuestionExtractModal {...baseProps} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [pdfFile()], writable: false });
    fireEvent.change(input);
    await waitFor(() => screen.getByText(/doc\.pdf/));
    fireEvent.click(screen.getByRole("button", { name: /Extrair/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Nenhuma quest/i)));
  });

  it("Trocar arquivo button returns to upload step", async () => {
    render(<QuestionExtractModal {...baseProps} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [pdfFile()], writable: false });
    fireEvent.change(input);
    await waitFor(() => screen.getByText(/doc\.pdf/));
    fireEvent.click(screen.getByRole("button", { name: /Trocar arquivo/i }));
    expect(screen.getByText(/Clique ou arraste/i)).toBeInTheDocument();
  });

  it("blocks upload when canExtract is false (no credits + free used)", () => {
    render(<QuestionExtractModal {...baseProps} freeExtractionUsed creditBalance={0} />);
    expect(screen.getByText(/Saldo insuficiente/i)).toBeInTheDocument();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it("toasts a generic error when invoke returns non-402 error", async () => {
    const { toast } = await import("sonner");
    invokeSpy.mockResolvedValue({
      data: null,
      error: { context: { status: 500 }, message: "AI down" },
    });
    render(<QuestionExtractModal {...baseProps} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [pdfFile()], writable: false });
    fireEvent.change(input);
    await waitFor(() => screen.getByText(/doc\.pdf/));
    fireEvent.click(screen.getByRole("button", { name: /Extrair/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/AI down|Falha/i)));
  });

  it("sends image as FormData when an image file is selected (L127-129 branch)", async () => {
    const onExtracted = vi.fn();
    invokeSpy.mockResolvedValue({
      data: { questions: [{ text: "Q1" }], source_file_name: "img.png" },
      error: null,
    });

    render(<QuestionExtractModal {...baseProps} onExtracted={onExtracted} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const imgFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "img.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [imgFile], configurable: true, writable: false });
    fireEvent.change(input);
    await waitFor(() => screen.getByText(/img\.png/));

    fireEvent.click(screen.getByRole("button", { name: /Extrair/i }));
    await waitFor(() => expect(invokeSpy).toHaveBeenCalledWith(
      "extract-questions",
      expect.objectContaining({ body: expect.any(FormData) }),
    ));
    await waitFor(() => expect(onExtracted).toHaveBeenCalled());
  });
});

describe("QuestionExtractModal — drop zone (L218-220)", () => {
  it("accepts a valid PDF dropped onto the drop zone and moves to confirm step", async () => {
    render(<QuestionExtractModal {...baseProps} />);

    const dropZone = screen.getByText(/Clique ou arraste o arquivo aqui/).closest("div")!;
    const droppedFile = pdfFile();

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [droppedFile] },
    });

    await waitFor(() => expect(screen.getByText(/doc\.pdf/)).toBeInTheDocument());
  });

  it("does not react to drop when canExtract is false", async () => {
    render(<QuestionExtractModal {...baseProps} freeExtractionUsed creditBalance={0} />);

    const dropZone = screen.getByText(/Clique ou arraste o arquivo aqui/).closest("div")!;

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [pdfFile()] },
    });

    // Should stay on the upload step — no file name rendered
    expect(screen.queryByText(/doc\.pdf/)).toBeNull();
  });
});
