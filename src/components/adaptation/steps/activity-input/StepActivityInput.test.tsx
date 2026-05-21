import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StepActivityInput } from "./StepActivityInput";
import type { WizardData } from "@/lib/domain/adaptationWizardHelpers";

// ── Supabase mock (bank query + auth session) ──────────────────────────────

const bankQuestionsResult: { data: unknown[]; error: null } = { data: [], error: null };

const fromChain = {
  select: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  ilike: vi.fn().mockReturnThis(),
  then(resolve: (v: unknown) => unknown) {
    return Promise.resolve(bankQuestionsResult).then(resolve);
  },
};

const getSessionSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => fromChain),
    auth: { getSession: (...a: unknown[]) => getSessionSpy(...a) },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  bankQuestionsResult.data = [];
  getSessionSpy.mockResolvedValue({ data: { session: { access_token: "tok" } } });
  fetchSpy.mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ questions: [] }),
  });
  vi.stubGlobal("fetch", fetchSpy);
});

// ── Fixtures ───────────────────────────────────────────────────────────────

const baseData: WizardData = {
  activityType: "exercício",
  activityText: "",
  selectedQuestions: [],
  barriers: [],
  barrierProfileId: null,
  result: null,
  wizardMode: "ai",
};

// ── Existing textarea tests (Colar Texto tab) ──────────────────────────────

describe("StepActivityInput — Colar Texto tab", () => {
  it("renders heading and textarea", () => {
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /Atividade original/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Conteúdo da atividade/i)).toBeInTheDocument();
  });

  it("blocks Next when textarea is empty and shows an alert", () => {
    const onNext = vi.fn();
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={onNext} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Digite ou cole/i);
  });

  it("calls onNext when textarea has content", () => {
    const onNext = vi.fn();
    render(
      <StepActivityInput
        data={{ ...baseData, activityText: "1) Q?" }}
        updateData={vi.fn()}
        onNext={onNext}
        onPrev={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(onNext).toHaveBeenCalled();
  });

  it("clears the alert after a successful next", () => {
    const updateData = vi.fn();
    const onNext = vi.fn();
    const { rerender } = render(
      <StepActivityInput data={baseData} updateData={updateData} onNext={onNext} onPrev={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rerender(
      <StepActivityInput
        data={{ ...baseData, activityText: "1) Q?" }}
        updateData={updateData}
        onNext={onNext}
        onPrev={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("forwards textarea typing to updateData", () => {
    const updateData = vi.fn();
    render(<StepActivityInput data={baseData} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Conteúdo da atividade/i), { target: { value: "novo texto" } });
    expect(updateData).toHaveBeenCalledWith({ activityText: "novo texto" });
  });

  it("Voltar button triggers onPrev", () => {
    const onPrev = vi.fn();
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={onPrev} />);
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(onPrev).toHaveBeenCalled();
  });
});

// ── Bank tab tests ─────────────────────────────────────────────────────────

describe("StepActivityInput — Banco de Questões tab", () => {
  it("shows tab buttons for Colar Texto and Banco de Questões", () => {
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Colar Texto/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Banco de Questões/i })).toBeInTheDocument();
  });

  it("switching to bank tab shows Abrir Banco button and hides textarea", () => {
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    expect(screen.getByRole("button", { name: /Abrir Banco de Questões/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Conteúdo da atividade/i)).toBeNull();
  });

  it("opens bank modal when clicking Abrir Banco de Questões", async () => {
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("shows questions fetched from the bank inside the modal", async () => {
    bankQuestionsResult.data = [
      { id: "q1", text: "Qual é a capital do Brasil?", subject: "Geografia", topic: null, difficulty: "facil", image_url: null, options: null },
    ];
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    await waitFor(() => {
      expect(screen.getByText("Qual é a capital do Brasil?")).toBeInTheDocument();
    });
  });

  it("selecting a question and confirming calls updateData with text and selectedQuestions", async () => {
    bankQuestionsResult.data = [
      { id: "q1", text: "Questão 1", subject: "Matemática", topic: null, difficulty: null, image_url: null, options: ["A", "B"] },
    ];
    const updateData = vi.fn();
    render(<StepActivityInput data={baseData} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    await waitFor(() => screen.getByText("Questão 1"));
    fireEvent.click(screen.getByText("Questão 1"));
    fireEvent.click(screen.getByRole("button", { name: /Adicionar 1/i }));
    expect(updateData).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedQuestions: expect.arrayContaining([expect.objectContaining({ id: "q1" })]),
        activityText: expect.stringContaining("Questão 1"),
      }),
    );
  });

  it("shows selected questions in bank tab after confirmation", async () => {
    const q = { id: "q1", text: "Questão selecionada", subject: "Física", topic: null, difficulty: null, image_url: null, options: null };
    const dataWithQuestion: WizardData = { ...baseData, selectedQuestions: [q], activityText: "1) Questão selecionada" };
    render(<StepActivityInput data={dataWithQuestion} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    expect(screen.getByText("Questão selecionada")).toBeInTheDocument();
  });

  it("remove button on selected question calls updateData without that question", async () => {
    const q = { id: "q1", text: "Questão selecionada", subject: "Física", topic: null, difficulty: null, image_url: null, options: null };
    const dataWithQuestion: WizardData = { ...baseData, selectedQuestions: [q], activityText: "1) Questão selecionada" };
    const updateData = vi.fn();
    render(<StepActivityInput data={dataWithQuestion} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Remover questão/i }));
    expect(updateData).toHaveBeenCalledWith(
      expect.objectContaining({ selectedQuestions: [], activityText: "" }),
    );
  });

  it("Próximo button is enabled when bank tab has selected questions with activityText", () => {
    const q = { id: "q1", text: "Q", subject: "Física", topic: null, difficulty: null, image_url: null, options: null };
    const dataWithQuestion: WizardData = { ...baseData, selectedQuestions: [q], activityText: "1) Q" };
    const onNext = vi.fn();
    render(<StepActivityInput data={dataWithQuestion} updateData={vi.fn()} onNext={onNext} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(onNext).toHaveBeenCalled();
  });
});

// ── Arquivo / Imagem tab tests ─────────────────────────────────────────────

describe("StepActivityInput — Arquivo tab", () => {
  it("shows Envio de Arquivo tab button", () => {
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Envio de Arquivo/i })).toBeInTheDocument();
  });

  it("switching to Arquivo tab shows PDF/DOCX drop zone", () => {
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Envio de Arquivo/i }));
    expect(screen.getByText(/PDF ou Word/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Conteúdo da atividade/i)).toBeNull();
  });

  it("uploading a PDF extracts questions and updates activityText", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ questions: [{ text: "Questão do arquivo", options: [] }] }),
    });
    const updateData = vi.fn();
    render(<StepActivityInput data={baseData} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Envio de Arquivo/i }));
    const input = document.querySelector("input[type='file'][accept='.pdf,.docx']") as HTMLInputElement;
    const file = new File(["pdf"], "prova.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(updateData).toHaveBeenCalledWith(
        expect.objectContaining({ activityText: expect.stringContaining("Questão do arquivo") }),
      );
    });
  });

  it("shows error toast when extraction returns non-ok", async () => {
    const { toast } = await import("sonner");
    fetchSpy.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Créditos insuficientes" }),
    });
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Envio de Arquivo/i }));
    const input = document.querySelector("input[type='file'][accept='.pdf,.docx']") as HTMLInputElement;
    const file = new File(["pdf"], "prova.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Créditos insuficientes"));
    });
  });
});

describe("StepActivityInput — Imagem tab", () => {
  it("shows Imagem tab button", () => {
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Imagem/i })).toBeInTheDocument();
  });

  it("switching to Imagem tab shows image drop zone", () => {
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Imagem/i }));
    expect(screen.getByText(/prova ou atividade/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Conteúdo da atividade/i)).toBeNull();
  });

  it("uploading an image extracts questions and updates activityText", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ questions: [{ text: "Questão da imagem", options: [] }] }),
    });
    const updateData = vi.fn();
    render(<StepActivityInput data={baseData} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Imagem/i }));
    const input = document.querySelector("input[type='file'][accept='image/*']") as HTMLInputElement;
    const file = new File(["img"], "prova.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(updateData).toHaveBeenCalledWith(
        expect.objectContaining({ activityText: expect.stringContaining("Questão da imagem") }),
      );
    });
  });
});
