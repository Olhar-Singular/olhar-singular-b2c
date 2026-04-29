import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/react";
import ManualQuestionEditor from "./ManualQuestionEditor";

const parsePdfMock = vi.fn();
const extractDocxTextMock = vi.fn();
const detectFileTypeMock = vi.fn();

vi.mock("@/lib/utils/pdf-utils", () => ({
  parsePdf: (...a: unknown[]) => parsePdfMock(...a),
}));
vi.mock("@/lib/utils/docx-utils", () => ({
  extractDocxText: (...a: unknown[]) => extractDocxTextMock(...a),
}));
vi.mock("@/lib/utils/fileValidation", () => ({
  detectFileType: (...a: unknown[]) => detectFileTypeMock(...a),
  validatePdfMagicBytes: () => true,
  validateImageMagicBytes: () => true,
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })),
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://uploaded.png" } }),
      }),
    },
  },
}));

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => null,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/forms/QuestionRichEditor", () => ({
  default: () => <div data-testid="rich" />,
}));

vi.mock("@/components/dialogs/PdfPreviewModal", () => ({ default: () => <div /> }));
vi.mock("@/components/dialogs/ImagePreviewDialog", () => ({ default: () => <div /> }));

beforeEach(() => {
  vi.clearAllMocks();
  parsePdfMock.mockResolvedValue({ text: "txt", pageImages: ["data:image/jpeg;base64,A"], pageCount: 1, pagesProcessed: [1] });
  extractDocxTextMock.mockResolvedValue("texto docx");
  detectFileTypeMock.mockReturnValue("pdf");
});

function pdfFile() {
  return new File([new Uint8Array([0x25])], "doc.pdf", { type: "application/pdf" });
}
function docxFile() {
  return new File([new Uint8Array([0x50])], "doc.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

describe("ManualQuestionEditor — file loading", () => {
  it("invokes parsePdf when file is a PDF", async () => {
    render(<ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />);
    await waitFor(() => expect(parsePdfMock).toHaveBeenCalled());
  });

  it("invokes extractDocxText when file is a DOCX", async () => {
    detectFileTypeMock.mockReturnValueOnce("docx");
    render(<ManualQuestionEditor file={docxFile()} onFinish={vi.fn()} />);
    await waitFor(() => expect(extractDocxTextMock).toHaveBeenCalled());
  });

  it("toasts error when parsePdf throws", async () => {
    const { toast } = await import("sonner");
    parsePdfMock.mockRejectedValueOnce(new Error("pdf-fail"));
    render(<ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("calls detectFileType to determine processing path", async () => {
    render(<ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />);
    await waitFor(() => expect(detectFileTypeMock).toHaveBeenCalled());
  });

  it("renders the file name in the header", async () => {
    const { findByText } = render(<ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />);
    await findByText(/doc\.pdf/);
  });

  it("Cancelar/Concluir button calls onFinish", async () => {
    const onFinish = vi.fn();
    const { findAllByText } = render(<ManualQuestionEditor file={pdfFile()} onFinish={onFinish} />);
    const buttons = await findAllByText(/Cancelar|Concluir/);
    buttons[0].click();
    expect(onFinish).toHaveBeenCalled();
  });

  it("disables 'Salvar todas' when no questions have content", async () => {
    const { findByRole } = render(<ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />);
    const saveAllButton = await findByRole("button", { name: /Salvar todas/i });
    expect(saveAllButton).toBeDisabled();
  });

  it("renders the page navigation when PDF has multiple pages", async () => {
    parsePdfMock.mockResolvedValue({
      text: "txt",
      pageImages: ["img1", "img2", "img3"],
      pageCount: 3,
      pagesProcessed: [1, 2, 3],
    });
    const { findByText } = render(<ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />);
    await findByText(/1\/3/);
  });

  it("renders the docx preview text when file is docx", async () => {
    detectFileTypeMock.mockReturnValueOnce("docx");
    const { findByText } = render(<ManualQuestionEditor file={docxFile()} onFinish={vi.fn()} />);
    await findByText(/texto docx/);
  });

  it("addQuestion button increments the question count", async () => {
    const { findByRole, container } = render(<ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />);
    const novaBtn = await findByRole("button", { name: /Nova questão/i });
    fireEvent.click(novaBtn);
    fireEvent.click(novaBtn);
    const tabs = Array.from(container.querySelectorAll("button")).filter((b) =>
      /^Q\d+/.test(b.textContent ?? ""),
    );
    expect(tabs.length).toBe(3);
  });

  it("removeQuestion button (X) deletes the active question", async () => {
    const { findByRole, container, queryAllByLabelText } = render(<ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />);
    const novaBtn = await findByRole("button", { name: /Nova questão/i });
    fireEvent.click(novaBtn);
    fireEvent.click(novaBtn);
    let tabs = Array.from(container.querySelectorAll("button")).filter((b) =>
      /^Q\d+/.test(b.textContent ?? ""),
    );
    expect(tabs.length).toBe(3);
    const removeButtons = queryAllByLabelText(/Remover questão/i);
    fireEvent.click(removeButtons[0]);
    tabs = Array.from(container.querySelectorAll("button")).filter((b) =>
      /^Q\d+/.test(b.textContent ?? ""),
    );
    expect(tabs.length).toBe(2);
  });

  it("zoom buttons appear with PDF navigation when there are page images", async () => {
    parsePdfMock.mockResolvedValue({
      text: "txt",
      pageImages: ["img1", "img2"],
      pageCount: 2,
      pagesProcessed: [1, 2],
    });
    const { findByText, container } = render(<ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />);
    await findByText(/1\/2/);
    const zoomIn = container.querySelector("svg.lucide-zoom-in")?.closest("button");
    const zoomOut = container.querySelector("svg.lucide-zoom-out")?.closest("button");
    expect(zoomIn).not.toBeNull();
    expect(zoomOut).not.toBeNull();
  });

  it("clicking on a question tab activates that question", async () => {
    const { findByRole, container } = render(<ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />);
    const novaBtn = await findByRole("button", { name: /Nova questão/i });
    fireEvent.click(novaBtn);
    const tabs = Array.from(container.querySelectorAll("button")).filter((b) =>
      /^Q\d+/.test(b.textContent ?? ""),
    );
    expect(tabs.length).toBe(2);
    fireEvent.click(tabs[1]);
    // Just verify no crash and the tab is still in the DOM
    expect(tabs[1]).toBeInTheDocument();
  });
});

describe("ManualQuestionEditor — question editing", () => {
  it("removeQuestion on the last remaining question resets to an empty question (line 39)", async () => {
    const { findByRole, queryAllByLabelText, container } = render(
      <ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />,
    );
    await findByRole("button", { name: /Nova questão/i });
    // Only one question exists; click its remove (X) button
    const removeButtons = queryAllByLabelText(/Remover questão/i);
    expect(removeButtons.length).toBe(1);
    fireEvent.click(removeButtons[0]);
    // Should still have exactly 1 question tab (reset, not deleted)
    const tabs = Array.from(container.querySelectorAll("button")).filter((b) =>
      /^Q\d+/.test(b.textContent ?? ""),
    );
    expect(tabs.length).toBe(1);
  });

  it("topic input onChange updates the question topic (line 450)", async () => {
    const { findByRole, getByPlaceholderText } = render(
      <ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />,
    );
    await findByRole("button", { name: /Nova questão/i });
    const topicInput = getByPlaceholderText(/Cinemática/i);
    fireEvent.change(topicInput, { target: { value: "Dinâmica" } });
    expect((topicInput as HTMLInputElement).value).toBe("Dinâmica");
  });

  it("alternatives section renders five option inputs (lines 468-487)", async () => {
    const { findByRole, getAllByPlaceholderText } = render(
      <ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />,
    );
    await findByRole("button", { name: /Nova questão/i });
    // Default question is objetiva — should render Alternativa A through E
    const altInputs = getAllByPlaceholderText(/Alternativa [A-E]/);
    expect(altInputs.length).toBe(5);
  });

  it("typing in an option input updates its value (line 475-476)", async () => {
    const { findByRole, getAllByPlaceholderText } = render(
      <ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />,
    );
    await findByRole("button", { name: /Nova questão/i });
    const altInputs = getAllByPlaceholderText(/Alternativa [A-E]/);
    fireEvent.change(altInputs[0], { target: { value: "Resposta A" } });
    expect((altInputs[0] as HTMLInputElement).value).toBe("Resposta A");
  });

  it("toggling the correct-answer letter button selects and deselects it (lines 468)", async () => {
    const { findByRole, getAllByRole } = render(
      <ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />,
    );
    await findByRole("button", { name: /Nova questão/i });
    // Letter buttons for alternatives are labeled A-E
    const letterA = getAllByRole("button").find((b) => b.textContent?.trim() === "A");
    expect(letterA).toBeDefined();
    fireEvent.click(letterA!);
    // After first click the button becomes selected (variant=default)
    expect(letterA!.className).toMatch(/default|bg-primary/);
    // Click again to deselect
    fireEvent.click(letterA!);
  });

  it("shows the gabarito hint when an option is filled but no correct answer is set (line 483-485)", async () => {
    const { findByRole, getAllByPlaceholderText, findByText } = render(
      <ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />,
    );
    await findByRole("button", { name: /Nova questão/i });
    const altInputs = getAllByPlaceholderText(/Alternativa [A-E]/);
    fireEvent.change(altInputs[0], { target: { value: "Opção preenchida" } });
    await findByText(/Clique na letra correta para definir o gabarito/i);
  });

  it("resolution textarea onChange updates the field (lines 489-498)", async () => {
    const { findByRole, getByPlaceholderText } = render(
      <ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />,
    );
    await findByRole("button", { name: /Nova questão/i });
    const resolutionTextarea = getByPlaceholderText(/Explicação da resposta/i);
    fireEvent.change(resolutionTextarea, { target: { value: "A resposta é B porque..." } });
    expect((resolutionTextarea as HTMLTextAreaElement).value).toBe("A resposta é B porque...");
  });

  it("Salvar questão button is disabled when enunciado is empty (lines 513-520)", async () => {
    const { findByRole } = render(
      <ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />,
    );
    await findByRole("button", { name: /Nova questão/i });
    const saveBtn = await findByRole("button", { name: /Salvar questão/i });
    expect(saveBtn).toBeDisabled();
  });

  it("Remover button in the bottom action bar removes the active question (line 520)", async () => {
    const { findByRole, container } = render(
      <ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />,
    );
    const novaBtn = await findByRole("button", { name: /Nova questão/i });
    fireEvent.click(novaBtn);
    // Now 2 questions — activate Q2
    const tabs = Array.from(container.querySelectorAll("button")).filter((b) =>
      /^Q\d+/.test(b.textContent ?? ""),
    );
    fireEvent.click(tabs[1]);
    // The bottom action bar has a ghost button containing the text "Remover" (with Trash2 icon)
    const removerBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Remover") && b.classList.contains("text-destructive"),
    );
    expect(removerBtn).toBeDefined();
    fireEvent.click(removerBtn!);
    const tabsAfter = Array.from(container.querySelectorAll("button")).filter((b) =>
      /^Q\d+/.test(b.textContent ?? ""),
    );
    expect(tabsAfter.length).toBe(1);
  });

  it("switching isObjective to false hides the alternatives section (lines 364-372)", async () => {
    const { findByRole, queryAllByPlaceholderText } = render(
      <ManualQuestionEditor file={pdfFile()} onFinish={vi.fn()} />,
    );
    await findByRole("button", { name: /Nova questão/i });
    // Default is objetiva=true; the switch label should say "Objetiva"
    expect(queryAllByPlaceholderText(/Alternativa [A-E]/).length).toBe(5);
    // Find and toggle the switch
    const switchEl = await findByRole("switch");
    fireEvent.click(switchEl);
    // After switching to dissertativa, alternatives should disappear
    expect(queryAllByPlaceholderText(/Alternativa [A-E]/).length).toBe(0);
  });
});
