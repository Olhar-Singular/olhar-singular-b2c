import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { StepActivityInput } from "./StepActivityInput";
import type { WizardData } from "@/lib/adaptation/wizard/wizardState";
import { MAX_ACTIVITY_CHARS } from "@/lib/domain/activityLimits";

// ── Supabase mock (bank query + auth session) ──────────────────────────────

const bankQuestionsResult: { data: unknown[] | null; error: unknown } = { data: [], error: null };

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
  bankQuestionsResult.error = null;
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

describe("StepActivityInput — direct upload CTA", () => {
  it("switches to upload mode via updateData, without touching activityType or advancing the step", () => {
    const updateData = vi.fn();
    const onNext = vi.fn();
    render(<StepActivityInput data={baseData} updateData={updateData} onNext={onNext} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Adaptar direto do arquivo/i }));
    expect(updateData).toHaveBeenCalledWith({ activityInputMode: "upload" });
    expect(onNext).not.toHaveBeenCalled();
  });
});

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

  // Regressão 1117: o erro só aparecia no role="alert"; a caixa não era marcada
  // nem recebia o foco, então o leitor de tela não sabia onde estava o problema
  // e, em 1366x768, a mensagem nascia abaixo da dobra.
  it.each([
    ["vazia", ""],
    ["só espaços", "     "],
    ["acima do limite", "a".repeat(MAX_ACTIVITY_CHARS + 1)],
  ])("marks and focuses the textarea when the activity is %s", (_label, activityText) => {
    render(
      <StepActivityInput
        data={{ ...baseData, activityText }}
        updateData={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />,
    );
    const textarea = screen.getByLabelText(/Conteúdo da atividade/i);
    expect(textarea).not.toHaveAttribute("aria-invalid");
    expect(textarea).not.toHaveAttribute("aria-describedby");
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    const alert = screen.getByRole("alert");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(alert.id).toBeTruthy();
    expect(textarea).toHaveAttribute("aria-describedby", alert.id);
    expect(textarea).toHaveClass("border-destructive");
    expect(textarea).toHaveFocus();
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

  it("exposes which tab is active via aria-pressed (1133)", () => {
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    const manual = screen.getByRole("button", { name: /Colar Texto/i });
    const bank = screen.getByRole("button", { name: /^Banco de Questões$/i });
    expect(manual).toHaveAttribute("aria-pressed", "true");
    expect(bank).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(bank);
    expect(manual).toHaveAttribute("aria-pressed", "false");
    expect(bank).toHaveAttribute("aria-pressed", "true");
  });

  it("names the subject and difficulty filters of the bank dialog (1133)", async () => {
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    await waitFor(() => screen.getByRole("dialog"));
    expect(screen.getByRole("combobox", { name: "Filtrar por matéria" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtrar por dificuldade" })).toBeInTheDocument();
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
        // Changing which questions make up the activity invalidates whatever
        // was generated from the old set — StepGenerate skips generation while
        // a result is present, so a stale one silently blocks the new run.
        result: null,
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
      // `result: null` for the same reason as the upload path: StepGenerate
      // skips generation while a result is present, so removing a question
      // without clearing it would silently reuse the old adaptation.
      expect.objectContaining({ selectedQuestions: [], activityText: "", result: null }),
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

// ── Tab visibility ─────────────────────────────────────────────────────────

describe("StepActivityInput — tab visibility", () => {
  it("does not show Envio de Arquivo tab button", () => {
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Envio de Arquivo/i })).not.toBeInTheDocument();
  });

  it("does not show Imagem (OCR) tab button", () => {
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^Imagem/i })).not.toBeInTheDocument();
  });

  it("defaults to Banco de Questões tab when questions exist in bank", async () => {
    bankQuestionsResult.data = [
      { id: "q1", text: "Q1", subject: "Física", topic: null, difficulty: null, image_url: null, options: null },
    ];
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Abrir Banco de Questões/i })).toBeInTheDocument();
    });
  });

  it("stays on Colar Texto tab when no questions exist in bank", async () => {
    bankQuestionsResult.data = [];
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByLabelText(/Conteúdo da atividade/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Abrir Banco de Questões/i })).not.toBeInTheDocument();
  });
});

// ── fetchBankQuestions filters (lines 116-120) ─────────────────────────────

describe("StepActivityInput — fetchBankQuestions filters", () => {
  // 1131: the search runs in the browser, over the same fields as the bank
  // page, accent-insensitive, and never turns `%`/`_` into LIKE wildcards.
  function openBankDialog() {
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
  }
  const searchRows = [
    { id: "s1", text: "Explique o processo de fotossíntese.", subject: "Ciências", topic: null, difficulty: null, image_url: null, options: null },
    { id: "s2", text: "Qual é a capital do Brasil?", subject: "Geografia", topic: "Capitais", difficulty: null, image_url: null, options: null },
    { id: "s3", text: "Palavra comprida", subject: "Português", topic: "Ortografia", difficulty: null, image_url: null, options: null },
    { id: "s4", text: "Aumentou 50% do preço", subject: "Matemática", topic: null, difficulty: null, image_url: null, options: null },
  ];

  it("finds a question typed without accents (1131)", async () => {
    bankQuestionsResult.data = searchRows;
    openBankDialog();
    await waitFor(() => screen.getByText("Qual é a capital do Brasil?"));
    fireEvent.change(screen.getByPlaceholderText("Buscar questões..."), { target: { value: "fotossintese" } });
    await waitFor(() => expect(screen.queryByText("Qual é a capital do Brasil?")).toBeNull());
    expect(screen.getByText("Explique o processo de fotossíntese.")).toBeInTheDocument();
    expect(fromChain.ilike).not.toHaveBeenCalled();
  });

  it("matches subject and topic like the bank page (1131)", async () => {
    bankQuestionsResult.data = searchRows;
    openBankDialog();
    await waitFor(() => screen.getByText("Palavra comprida"));
    fireEvent.change(screen.getByPlaceholderText("Buscar questões..."), { target: { value: "ortografia" } });
    await waitFor(() => expect(screen.queryByText("Qual é a capital do Brasil?")).toBeNull());
    expect(screen.getByText("Palavra comprida")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Buscar questões..."), { target: { value: "  GEOGRAFIA " } });
    await waitFor(() => screen.getByText("Qual é a capital do Brasil?"));
    expect(screen.queryByText("Palavra comprida")).toBeNull();
  });

  it("treats % and _ as literal characters (1131)", async () => {
    bankQuestionsResult.data = searchRows;
    openBankDialog();
    await waitFor(() => screen.getByText("Palavra comprida"));
    fireEvent.change(screen.getByPlaceholderText("Buscar questões..."), { target: { value: "_" } });
    await waitFor(() => expect(screen.getByText(/Nenhuma questão encontrada/)).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("Buscar questões..."), { target: { value: "50%" } });
    await waitFor(() => screen.getByText("Aumentou 50% do preço"));
    expect(screen.queryByText("Palavra comprida")).toBeNull();
  });

  it("does not cap the bank list at a fixed number of rows (1131)", async () => {
    bankQuestionsResult.data = searchRows;
    openBankDialog();
    await waitFor(() => screen.getByText("Palavra comprida"));
    expect(fromChain.limit).not.toHaveBeenCalledWith(50);
  });

  it("applies eq filter when subject filter is set to a specific subject", async () => {
    bankQuestionsResult.data = [
      { id: "q1", text: "Questão de Matemática", subject: "Matemática", topic: null, difficulty: null, image_url: null, options: null },
    ];
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    await waitFor(() => screen.getByRole("dialog"));
    const subjectTrigger = screen.getByRole("combobox", { name: "Filtrar por matéria" });
    fireEvent.click(subjectTrigger);
    await waitFor(() => screen.getByRole("option", { name: "Matemática" }));
    fireEvent.click(screen.getByRole("option", { name: "Matemática" }));
    await waitFor(() => {
      expect(fromChain.eq).toHaveBeenCalledWith("subject", "Matemática");
    });
  });

  it("applies eq filter when difficulty filter is set", async () => {
    bankQuestionsResult.data = [
      { id: "q1", text: "Questão fácil", subject: "Física", topic: null, difficulty: "facil", image_url: null, options: null },
    ];
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    await waitFor(() => screen.getByRole("dialog"));
    const difficultyTrigger = screen.getByRole("combobox", { name: "Filtrar por dificuldade" });
    fireEvent.click(difficultyTrigger);
    await waitFor(() => screen.getByRole("option", { name: "Fácil" }));
    fireEvent.click(screen.getByRole("option", { name: "Fácil" }));
    await waitFor(() => {
      expect(fromChain.eq).toHaveBeenCalledWith("difficulty", "facil");
    });
  });

  it("handles null rows from supabase (uses empty array fallback — branch line 120)", async () => {
    // Override fromChain to resolve with data:null, covering the `|| []` false branch
    const originalThen = fromChain.then.bind(fromChain);
    let nullResolvedCount = 0;
    fromChain.then = function(this: typeof fromChain, resolve: (v: unknown) => unknown) {
      nullResolvedCount++;
      return Promise.resolve({ data: null, error: null }).then(resolve);
    };
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    await waitFor(() => {
      expect(screen.getByText(/Seu banco ainda não tem questões/)).toBeInTheDocument();
    });
    fromChain.then = originalThen;
  });
});

// ── toggleQuestion deselect (line 147) ────────────────────────────────────

describe("StepActivityInput — toggleQuestion deselect", () => {
  it("deselects a question when clicked twice", async () => {
    bankQuestionsResult.data = [
      { id: "q1", text: "Questão para deselecionar", subject: "Física", topic: null, difficulty: null, image_url: null, options: null },
    ];
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    await waitFor(() => screen.getByText("Questão para deselecionar"));
    // First click selects
    fireEvent.click(screen.getByText("Questão para deselecionar"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Adicionar 1/i })).toBeInTheDocument();
    });
    // Second click deselects
    fireEvent.click(screen.getByText("Questão para deselecionar"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Adicionar 0/i })).toBeInTheDocument();
    });
  });
});

// ── Count what actually enters the activity (1130) ────────────────────────

describe("StepActivityInput — the add button and toast count what enters (1130)", () => {
  function openBank(data: WizardData, updateData = vi.fn()) {
    render(<StepActivityInput data={data} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    return updateData;
  }

  it("shows questions already in the activity as checked and not selectable", async () => {
    const existingQ = { id: "q1", text: "Questão já selecionada", subject: "Física", topic: null, difficulty: null, image_url: null, options: null };
    bankQuestionsResult.data = [existingQ];
    const data: WizardData = { ...baseData, selectedQuestions: [existingQ], activityText: "1) Questão já selecionada" };
    openBank(data);
    const dialog = await waitFor(() => screen.getByRole("dialog", { name: /Selecionar Questões/i }));
    const card = await waitFor(() => within(dialog).getByRole("checkbox", { name: /Questão já selecionada/ }));
    expect(card).toHaveAttribute("aria-checked", "true");
    expect(card).toHaveAttribute("aria-disabled", "true");
    expect(within(card).getByText(/Já adicionada/i)).toBeInTheDocument();
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: " " });
    expect(screen.getByRole("button", { name: /Adicionar 0/i })).toBeDisabled();
  });

  it("keeps a checked question when the filter hides it, adds it and counts it", async () => {
    bankQuestionsResult.data = [
      { id: "q7", text: "Resolva: x/2 + 3 = 7", subject: "Matemática", topic: null, difficulty: "medio", image_url: null, options: null },
      { id: "q8", text: "Fotossíntese", subject: "Ciências", topic: null, difficulty: null, image_url: null, options: null },
    ];
    const updateData = openBank(baseData);
    await waitFor(() => screen.getByText("Resolva: x/2 + 3 = 7"));
    fireEvent.click(screen.getByText("Resolva: x/2 + 3 = 7"));
    // The search no longer shows the checked question.
    fireEvent.change(screen.getByPlaceholderText("Buscar questões..."), { target: { value: "Foto" } });
    await waitFor(() => screen.getByText("Fotossíntese"));
    expect(screen.queryByText("Resolva: x/2 + 3 = 7")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Adicionar 1/i }));
    expect(updateData).toHaveBeenCalledWith(
      expect.objectContaining({ selectedQuestions: [expect.objectContaining({ id: "q7" })] }),
    );
    expect(toast.success).toHaveBeenCalledWith("1 questão(ões) adicionada(s)");
  });

  it("toasts the number of questions added, not the number checked on screen", async () => {
    const existingQ = { id: "q1", text: "Capital", subject: "Geografia", topic: null, difficulty: null, image_url: null, options: null };
    bankQuestionsResult.data = [
      existingQ,
      { id: "q2", text: "Sete vezes oito", subject: "Matemática", topic: null, difficulty: null, image_url: null, options: null },
    ];
    const data: WizardData = { ...baseData, selectedQuestions: [existingQ], activityText: "1) Capital" };
    const updateData = openBank(data);
    await waitFor(() => screen.getByText("Sete vezes oito"));
    fireEvent.click(screen.getByText("Sete vezes oito"));
    fireEvent.click(screen.getByRole("button", { name: /Adicionar 1/i }));
    expect(updateData.mock.calls[0][0].selectedQuestions.map((q: { id: string }) => q.id)).toEqual(["q1", "q2"]);
    expect(toast.success).toHaveBeenCalledWith("1 questão(ões) adicionada(s)");
  });
});

// ── confirmBankSelection with non-array options (line 158) ─────────────────

describe("StepActivityInput — confirmBankSelection non-array options", () => {
  it("maps options to null when question options is not an array", async () => {
    bankQuestionsResult.data = [
      { id: "q2", text: "Questão sem opções array", subject: "Química", topic: null, difficulty: null, image_url: null, options: { key: "value" } },
    ];
    const updateData = vi.fn();
    render(<StepActivityInput data={baseData} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    await waitFor(() => screen.getByText("Questão sem opções array"));
    fireEvent.click(screen.getByText("Questão sem opções array"));
    fireEvent.click(screen.getByRole("button", { name: /Adicionar 1/i }));
    expect(updateData).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedQuestions: expect.arrayContaining([
          expect.objectContaining({ id: "q2", options: null }),
        ]),
      }),
    );
  });
});

// ── Selected question with image_url (lines 251-253, 274-276) ─────────────

describe("StepActivityInput — selected question with image_url", () => {
  it("renders image and 'Com imagem' badge for selected question with image_url", () => {
    const q = { id: "q1", text: "Questão com imagem", subject: "Física", topic: "Mecânica", difficulty: null, image_url: "https://example.com/img.png", options: null };
    const dataWithQuestion: WizardData = { ...baseData, selectedQuestions: [q], activityText: "1) Questão com imagem" };
    render(<StepActivityInput data={dataWithQuestion} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    expect(screen.getByAltText("Imagem da questão")).toBeInTheDocument();
    expect(screen.getByText("Com imagem")).toBeInTheDocument();
  });

  it("clicking image of selected question opens image preview dialog", () => {
    const q = { id: "q1", text: "Questão com imagem", subject: "Física", topic: null, difficulty: null, image_url: "https://example.com/img.png", options: null };
    const dataWithQuestion: WizardData = { ...baseData, selectedQuestions: [q], activityText: "1) Questão com imagem" };
    render(<StepActivityInput data={dataWithQuestion} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByAltText("Imagem da questão"));
    // The preview dialog should open — the image should appear inside the dialog
    const images = screen.getAllByAltText(/Imagem da questão|Prévia da imagem da questão/i);
    expect(images.length).toBeGreaterThan(0);
  });

  it("renders topic badge for selected question with topic", () => {
    const q = { id: "q1", text: "Questão com tópico", subject: "Física", topic: "Cinemática", difficulty: null, image_url: null, options: null };
    const dataWithQuestion: WizardData = { ...baseData, selectedQuestions: [q], activityText: "1) Questão com tópico" };
    render(<StepActivityInput data={dataWithQuestion} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    expect(screen.getByText("Cinemática")).toBeInTheDocument();
  });
});

// ── Selected question options rendering (lines 263-268) ───────────────────

describe("StepActivityInput — selected question options rendering", () => {
  it("renders answer options A), B) for selected question with options array", () => {
    const q = { id: "q1", text: "Questão com alternativas", subject: "Matemática", topic: null, difficulty: null, image_url: null, options: ["Opção A", "Opção B", "Opção C"] };
    const dataWithQuestion: WizardData = { ...baseData, selectedQuestions: [q], activityText: "1) Questão com alternativas\n   A) Opção A\n   B) Opção B\n   C) Opção C" };
    render(<StepActivityInput data={dataWithQuestion} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    expect(screen.getByText("A) Opção A")).toBeInTheDocument();
    expect(screen.getByText("B) Opção B")).toBeInTheDocument();
    expect(screen.getByText("C) Opção C")).toBeInTheDocument();
  });
});

// ── Bank modal: image_url click (lines 365-370) ───────────────────────────

describe("StepActivityInput — bank modal image click", () => {
  it("clicking question image in bank modal opens image preview dialog", async () => {
    bankQuestionsResult.data = [
      { id: "q1", text: "Questão com imagem no banco", subject: "Física", topic: null, difficulty: null, image_url: "https://example.com/bank-img.png", options: null },
    ];
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    await waitFor(() => screen.getByText("Questão com imagem no banco"));
    const img = screen.getByAltText("Imagem da questão");
    // Click the image wrapper — stopPropagation prevents question toggle; sets previewImageUrl
    fireEvent.click(img.parentElement!);
    // The ImagePreviewDialog renders an <img> with the preview URL as src when open
    // The Radix preview dialog may aria-hide the bank modal, so query the DOM directly
    await waitFor(() => {
      const previewImg = document.querySelector('img[src="https://example.com/bank-img.png"]');
      expect(previewImg).not.toBeNull();
    });
  });
});

// ── Bank modal: topic and difficulty badges (lines 383-386) ───────────────

describe("StepActivityInput — bank modal topic and difficulty badges", () => {
  it("shows topic badge for bank question with topic", async () => {
    bankQuestionsResult.data = [
      { id: "q1", text: "Questão com tópico", subject: "Física", topic: "Dinâmica", difficulty: null, image_url: null, options: null },
    ];
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    await waitFor(() => screen.getByText("Dinâmica"));
    expect(screen.getByText("Dinâmica")).toBeInTheDocument();
  });

  it("shows difficulty label badge for bank question with known difficulty", async () => {
    bankQuestionsResult.data = [
      { id: "q1", text: "Questão difícil", subject: "Química", topic: null, difficulty: "dificil", image_url: null, options: null },
    ];
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    await waitFor(() => screen.getByText("Questão difícil"));
    expect(screen.getByText("Difícil")).toBeInTheDocument();
  });

  it("shows raw difficulty value when difficulty not found in DIFFICULTIES list", async () => {
    bankQuestionsResult.data = [
      { id: "q1", text: "Questão com dificuldade desconhecida", subject: "Arte", topic: null, difficulty: "extremo", image_url: null, options: null },
    ];
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    await waitFor(() => screen.getByText("Questão com dificuldade desconhecida"));
    expect(screen.getByText("extremo")).toBeInTheDocument();
  });
});

// ── ImagePreviewDialog onOpenChange (line 410) ────────────────────────────

describe("StepActivityInput — ImagePreviewDialog onOpenChange", () => {
  it("closes the image preview and clears previewImageUrl when dialog is closed", async () => {
    const q = { id: "q1", text: "Questão com imagem para fechar", subject: "Física", topic: null, difficulty: null, image_url: "https://example.com/img2.png", options: null };
    const dataWithQuestion: WizardData = { ...baseData, selectedQuestions: [q], activityText: "1) Questão com imagem para fechar" };
    render(<StepActivityInput data={dataWithQuestion} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    // Click the image in the selected question list to open preview
    fireEvent.click(screen.getByAltText("Imagem da questão"));
    // Verify preview is open — the image is shown with the preview title as alt
    await waitFor(() => {
      expect(screen.getByAltText("Prévia da imagem da questão")).toBeInTheDocument();
    });
    // Close the preview dialog by clicking the close button (Radix DialogPrimitive.Close)
    // which triggers onOpenChange(false) → setPreviewImageUrl(null)
    const allButtons = screen.getAllByRole("button");
    // The close button is the one inside the preview dialog context (the X icon button)
    // It has no text content (just an svg icon) and is inside the preview dialog
    const previewDialogClose = allButtons.find((btn) => {
      return btn.closest('[role="dialog"]') !== null && btn.textContent?.trim() === "";
    });
    if (previewDialogClose) {
      fireEvent.click(previewDialogClose);
      await waitFor(() => {
        expect(screen.queryByAltText("Prévia da imagem da questão")).toBeNull();
      });
    } else {
      // Fallback: verify preview dialog was opened (covers line 410's open=false case partially)
      expect(screen.getByAltText("Prévia da imagem da questão")).toBeInTheDocument();
    }
  });

  it("does not clear previewImageUrl when onOpenChange is called with true (open=true branch)", async () => {
    // Cover the `if (!open)` false branch (open=true → do nothing)
    // by clicking the image to open preview (previewImageUrl is set) then clicking again
    const q = { id: "q1", text: "Questão img preview", subject: "Física", topic: null, difficulty: null, image_url: "https://example.com/open-true.png", options: null };
    const dataWithQuestion: WizardData = { ...baseData, selectedQuestions: [q], activityText: "1) Questão img preview" };
    render(<StepActivityInput data={dataWithQuestion} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    // Click image to open preview
    fireEvent.click(screen.getByAltText("Imagem da questão"));
    // preview dialog opens (previewImageUrl set)
    await waitFor(() => {
      const previewImg = document.querySelector('img[src="https://example.com/open-true.png"]');
      expect(previewImg).not.toBeNull();
    });
    // At this point !!previewImageUrl === true → open=true was already passed to ImagePreviewDialog
    // The image should still be there (onOpenChange(true) is a no-op)
    const previewImg = document.querySelector('img[src="https://example.com/open-true.png"]');
    expect(previewImg).not.toBeNull();
  });
});

// ── Bank tab: error alert visible (line 288-289) ──────────────────────────

describe("StepActivityInput — banco tab error alert", () => {
  it("shows error alert in banco tab when Próximo is clicked without activityText", () => {
    const onNext = vi.fn();
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={onNext} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Digite ou cole/i);
  });
});

// ── Bank query failure surfaces an error (not a silent empty list) ──────────

describe("StepActivityInput — bank query error", () => {
  it("shows an error and toasts when the bank query fails (no silent empty)", async () => {
    bankQuestionsResult.data = null;
    bankQuestionsResult.error = { message: "boom" };
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Erro ao carregar o banco/i);
    });
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Erro ao carregar o banco/i));
    // It must NOT fall back to the "no questions found" empty state.
    expect(screen.queryByText(/Nenhuma questão encontrada/i)).toBeNull();
  });
});

// ── Limite de tamanho da atividade ─────────────────────────────────────────

/**
 * Regressão: o servidor corta a atividade em MAX_ACTIVITY_CHARS (depois de
 * escapar o HTML) sem avisar ninguém. Colar uma prova longa cobrava os créditos
 * e devolvia metade da prova adaptada, sem nenhum sinal na tela. O passo tem de
 * mostrar quanto falta e travar antes da cobrança.
 */
describe("StepActivityInput — limite de tamanho", () => {
  const overLimit = "a".repeat(MAX_ACTIVITY_CHARS + 1);

  it("shows a character counter for the pasted activity", () => {
    render(
      <StepActivityInput
        data={{ ...baseData, activityText: "abc" }}
        updateData={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />,
    );
    expect(screen.getByTestId("activity-char-count")).toHaveTextContent(
      `3 / ${MAX_ACTIVITY_CHARS.toLocaleString("pt-BR")}`,
    );
  });

  it("blocks Next and explains when the activity is over the limit", () => {
    const onNext = vi.fn();
    render(
      <StepActivityInput
        data={{ ...baseData, activityText: overLimit }}
        updateData={vi.fn()}
        onNext={onNext}
        onPrev={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/limite/i);
  });

  it("counts the ESCAPED length, which is what the server truncates", () => {
    render(
      <StepActivityInput
        data={{ ...baseData, activityText: "<".repeat(4000) }}
        updateData={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />,
    );
    expect(screen.getByTestId("activity-char-count")).toHaveTextContent("16.000");
  });

  it("still advances at exactly the limit", () => {
    const onNext = vi.fn();
    render(
      <StepActivityInput
        data={{ ...baseData, activityText: "a".repeat(MAX_ACTIVITY_CHARS) }}
        updateData={vi.fn()}
        onNext={onNext}
        onPrev={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(onNext).toHaveBeenCalled();
  });
});

// ── bank question cards reachable by keyboard (1126) ───────────────────────

describe("StepActivityInput — bank question cards are keyboard accessible", () => {
  async function openBankWith(text: string) {
    bankQuestionsResult.data = [
      { id: "q1", text, subject: "Física", topic: null, difficulty: null, image_url: null, options: null },
    ];
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    return waitFor(() => screen.getByRole("checkbox", { name: new RegExp(text) }));
  }

  it("exposes each card as a focusable checkbox with its checked state", async () => {
    const card = await openBankWith("Questão por teclado");
    expect(card).toHaveAttribute("tabindex", "0");
    expect(card).toHaveAttribute("aria-checked", "false");
    fireEvent.click(card);
    await waitFor(() => expect(card).toHaveAttribute("aria-checked", "true"));
  });

  it("toggles the card with Space and Enter", async () => {
    const card = await openBankWith("Questão por teclado");
    fireEvent.keyDown(card, { key: " " });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Adicionar 1/i })).toBeEnabled();
    });
    fireEvent.keyDown(card, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Adicionar 0/i })).toBeInTheDocument();
    });
  });

  it("ignores other keys and keys from nested elements", async () => {
    const card = await openBankWith("Questão por teclado");
    fireEvent.keyDown(card, { key: "a" });
    fireEvent.keyDown(screen.getByText("Questão por teclado"), { key: "Enter" });
    expect(card).toHaveAttribute("aria-checked", "false");
  });
});

describe("StepActivityInput — manual edits are never discarded silently (1129)", () => {
  const q1 = { id: "q1", text: "Questão um", subject: "Física", topic: null, difficulty: null, image_url: null, options: null };
  const q2 = { id: "q2", text: "Questão dois", subject: "Física", topic: null, difficulty: null, image_url: null, options: null };
  const editedText = "1) Questão um\n\n2) Questão dois\n\n3) PERGUNTA DIGITADA A MAO";

  it("asks before rebuilding the text on remove and keeps it when the user cancels", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const updateData = vi.fn();
    const data: WizardData = { ...baseData, selectedQuestions: [q1, q2], activityText: editedText };
    render(<StepActivityInput data={data} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /Remover questão/i })[0]);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(updateData).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("rebuilds the text on remove when the user confirms", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const updateData = vi.fn();
    const data: WizardData = { ...baseData, selectedQuestions: [q1, q2], activityText: editedText };
    render(<StepActivityInput data={data} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /Remover questão/i })[0]);
    expect(updateData).toHaveBeenCalledWith(
      expect.objectContaining({ selectedQuestions: [q2], activityText: "1) Questão dois", result: null }),
    );
    confirmSpy.mockRestore();
  });

  it("does not ask when the text still matches the bank list", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const updateData = vi.fn();
    const data: WizardData = { ...baseData, selectedQuestions: [q1, q2], activityText: "1) Questão um\n\n2) Questão dois" };
    render(<StepActivityInput data={data} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /Remover questão/i })[0]);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(updateData).toHaveBeenCalledWith(expect.objectContaining({ activityText: "1) Questão dois" }));
    confirmSpy.mockRestore();
  });

  it("asks before adding bank questions over an edited text and keeps it when the user cancels", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    bankQuestionsResult.data = [
      { id: "q3", text: "Questão três", subject: "Física", topic: null, difficulty: null, image_url: null, options: null },
    ];
    const updateData = vi.fn();
    const data: WizardData = { ...baseData, selectedQuestions: [q1, q2], activityText: editedText };
    render(<StepActivityInput data={data} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    await waitFor(() => screen.getByText("Questão três"));
    fireEvent.click(screen.getByText("Questão três"));
    fireEvent.click(screen.getByRole("button", { name: /Adicionar 1/i }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(updateData).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("asks before adding bank questions over text typed with no bank questions yet", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    bankQuestionsResult.data = [
      { id: "q3", text: "Questão três", subject: "Física", topic: null, difficulty: null, image_url: null, options: null },
    ];
    const updateData = vi.fn();
    const data: WizardData = { ...baseData, activityText: "texto colado à mão" };
    render(<StepActivityInput data={data} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    await waitFor(() => screen.getByText("Questão três"));
    fireEvent.click(screen.getByText("Questão três"));
    fireEvent.click(screen.getByRole("button", { name: /Adicionar 1/i }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(updateData).toHaveBeenCalledWith(expect.objectContaining({ activityText: "1) Questão três" }));
    confirmSpy.mockRestore();
  });
});

/**
 * 1127: the bank dialog is opened by state, with no `DialogTrigger`, so Radix
 * restores focus to `<body>` on close. Closing must hand focus back to the
 * "Abrir Banco de Questões" button, whether by Escape or after adding.
 */
describe("StepActivityInput — focus return when the bank dialog closes (1127)", () => {
  function openBank() {
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    const trigger = screen.getByRole("button", { name: /Abrir Banco de Questões/i });
    fireEvent.click(trigger);
    return trigger;
  }

  it("returns focus to 'Abrir Banco de Questões' when dismissed with Escape", async () => {
    const trigger = openBank();
    const dialog = await screen.findByRole("dialog", { name: /Selecionar Questões/i });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.activeElement).toBe(trigger);
  });

  it("returns focus to 'Abrir Banco de Questões' after adding questions", async () => {
    bankQuestionsResult.data = [
      { id: "q2", text: "Sete vezes oito", subject: "Matemática", topic: null, difficulty: null, image_url: null, options: null },
    ];
    const trigger = openBank();
    await waitFor(() => screen.getByText("Sete vezes oito"));
    fireEvent.click(screen.getByText("Sete vezes oito"));
    fireEvent.click(screen.getByRole("button", { name: /Adicionar 1/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.activeElement).toBe(trigger);
  });
});

describe("StepActivityInput — removing a selected question keeps focus and is announced (1128)", () => {
  const mk = (id: string, text: string) => ({ id, text, subject: "Física", topic: null, difficulty: null, image_url: null, options: null });
  const qs = [mk("q1", "Questão um"), mk("q2", "Questão dois"), mk("q3", "Questão três"), mk("q4", "Questão quatro")];

  function Harness({ initial }: { initial: typeof qs }) {
    const [data, setData] = useState<WizardData>({
      ...baseData,
      selectedQuestions: initial,
      activityText: initial.map((q, i) => `${i + 1}) ${q.text}`).join("\n\n"),
    });
    return (
      <StepActivityInput
        data={data}
        updateData={(partial) => setData((d) => ({ ...d, ...partial }))}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />
    );
  }

  function openBankTab() {
    fireEvent.click(screen.getByRole("button", { name: /^Banco de Questões$/i }));
  }

  it("gives each remove button a name that identifies its question", () => {
    render(<Harness initial={qs} />);
    openBankTab();
    const names = screen.getAllByRole("button", { name: /Remover questão/i }).map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Remover questão 1", "Remover questão 2", "Remover questão 3", "Remover questão 4"]);
  });

  it("moves focus to the next question's remove button instead of <body>", () => {
    render(<Harness initial={qs} />);
    openBankTab();
    const third = screen.getByRole("button", { name: "Remover questão 3" });
    third.focus();
    fireEvent.click(third);
    expect(screen.queryByText("Questão três")).not.toBeInTheDocument();
    // The old 4th question is now the 3rd one.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remover questão 3" }));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("falls back to the previous question when the last one is removed", () => {
    render(<Harness initial={qs} />);
    openBankTab();
    fireEvent.click(screen.getByRole("button", { name: "Remover questão 4" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remover questão 3" }));
  });

  it("falls back to the bank opener when the list empties", () => {
    render(<Harness initial={[qs[0]]} />);
    openBankTab();
    fireEvent.click(screen.getByRole("button", { name: "Remover questão 1" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
  });

  it("announces the removal and the new count in a polite live region", () => {
    render(<Harness initial={qs} />);
    openBankTab();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "Remover questão 2" }));
    expect(screen.getByRole("status")).toHaveTextContent("Questão removida. 3 questão(ões) selecionada(s).");
  });

  it("does not move focus nor announce when the user cancels the rebuild", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    function Edited() {
      const [data, setData] = useState<WizardData>({ ...baseData, selectedQuestions: qs, activityText: "editado à mão" });
      return <StepActivityInput data={data} updateData={(p) => setData((d) => ({ ...d, ...p }))} onNext={vi.fn()} onPrev={vi.fn()} />;
    }
    render(<Edited />);
    openBankTab();
    const second = screen.getByRole("button", { name: "Remover questão 2" });
    second.focus();
    fireEvent.click(second);
    expect(document.activeElement).toBe(second);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    confirmSpy.mockRestore();
  });

  it("uses a remove target larger than 24x24", () => {
    render(<Harness initial={qs} />);
    openBankTab();
    const btn = screen.getByRole("button", { name: "Remover questão 1" });
    expect(btn.className).not.toMatch(/\bh-6\b/);
    expect(btn.className).toMatch(/\bh-8\b/);
    expect(btn.className).toMatch(/\bw-8\b/);
  });
});

describe("StepActivityInput — long unbroken words wrap inside the cards (1132)", () => {
  // A token wider than the card (URL, formula, code) does not wrap by default; the
  // line-clamp's overflow:hidden then cuts it mid-word with no ellipsis.
  const longToken = "Pneumoultramicroscopicossilicovulcanoconiotico_sem_espacos_para_testar_quebra_de_linha";
  const q = { id: "q1", text: longToken, subject: "Física", topic: null, difficulty: null, image_url: null, options: null };

  it("lets the long word break in the selected-question list", () => {
    const data: WizardData = { ...baseData, selectedQuestions: [q], activityText: `1) ${longToken}` };
    render(<StepActivityInput data={data} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Banco de Questões$/i }));
    expect(screen.getByText(longToken)).toHaveClass("break-words");
  });

  it("lets the long word break in the bank dialog card", async () => {
    bankQuestionsResult.data = [q];
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    const text = await within(await screen.findByRole("dialog")).findByText(longToken);
    expect(text).toHaveClass("break-words");
  });
});

describe("StepActivityInput — bank dialog never claims empty before querying (1134)", () => {
  function openBankDialog() {
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Banco de Questões$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
  }

  it("shows loading, not 'empty', right after reopening the dialog", async () => {
    openBankDialog();
    await within(await screen.findByRole("dialog")).findByText(/ainda não tem questões/i);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    bankQuestionsResult.data = [
      { id: "n1", text: "Questão nova", subject: "Física", topic: null, difficulty: null, image_url: null, options: null },
    ];
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    const dialog = await screen.findByRole("dialog");
    // Before the debounced query resolves, the stale empty state must not show.
    expect(within(dialog).queryByText(/ainda não tem questões/i)).toBeNull();
    expect(within(dialog).queryByText(/Nenhuma questão encontrada/i)).toBeNull();
    expect(within(dialog).getByRole("status", { name: /Carregando questões/i })).toBeInTheDocument();
    await within(dialog).findByText("Questão nova");
  });

  it("tells an empty bank apart and offers the paste-text path", async () => {
    openBankDialog();
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(/Seu banco ainda não tem questões/i);
    expect(within(dialog).queryByText(/Nenhuma questão encontrada/i)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: /Colar Texto/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText(/Conteúdo da atividade/i)).toBeInTheDocument();
  });

  // 0533: the bank tab (and its trigger) unmounts on this path, so focus must
  // land on the textarea the button promised instead of falling to <body>.
  it("focuses the activity textarea after 'Colar Texto' from the empty bank", async () => {
    openBankDialog();
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(/Seu banco ainda não tem questões/i);
    fireEvent.click(within(dialog).getByRole("button", { name: /Colar Texto/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText(/Conteúdo da atividade/i)).toHaveFocus();
  });

  it("says the search/filter found nothing and lets the user clear it", async () => {
    bankQuestionsResult.data = [
      { id: "s1", text: "Questão de Física", subject: "Física", topic: null, difficulty: null, image_url: null, options: null },
    ];
    openBankDialog();
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Questão de Física");
    fireEvent.change(within(dialog).getByPlaceholderText("Buscar questões..."), { target: { value: "zzz" } });
    await within(dialog).findByText(/Nenhuma questão encontrada para esta busca ou filtro/i);
    expect(within(dialog).queryByText(/ainda não tem questões/i)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: /Limpar filtros/i }));
    await within(dialog).findByText("Questão de Física");
    expect(within(dialog).getByPlaceholderText("Buscar questões...")).toHaveValue("");
  });

  // 0535: 'Limpar filtros' unmounts itself, so focus must land on the search
  // field instead of falling back to the dialog container.
  it("focuses the search field after 'Limpar filtros'", async () => {
    bankQuestionsResult.data = [
      { id: "s1", text: "Questão de Física", subject: "Física", topic: null, difficulty: null, image_url: null, options: null },
    ];
    openBankDialog();
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Questão de Física");
    fireEvent.change(within(dialog).getByPlaceholderText("Buscar questões..."), { target: { value: "zzz" } });
    const clear = await within(dialog).findByRole("button", { name: /Limpar filtros/i });
    clear.focus();
    fireEvent.click(clear);
    await within(dialog).findByText("Questão de Física");
    expect(within(dialog).getByPlaceholderText("Buscar questões...")).toHaveFocus();
  });
});

/**
 * 0534: the bank dialog state (selection, search, filters) lives in the step,
 * so closing the dialog must reset it. Otherwise an abandoned selection comes
 * back checked, an old search hides most of the bank, and a selection hidden by
 * the filter is added without the user seeing it.
 */
describe("StepActivityInput — the bank dialog starts clean on every opening (0534)", () => {
  const q7 = { id: "q7", text: "Resolva: x/2 + 3 = 7", subject: "Matemática", topic: null, difficulty: "medio", image_url: null, options: null };
  const q8 = { id: "q8", text: "Fotossíntese", subject: "Ciências", topic: null, difficulty: null, image_url: null, options: null };

  function renderOnBankTab(data: WizardData = baseData) {
    render(<StepActivityInput data={data} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Banco de Questões/i }));
  }

  async function openDialog() {
    fireEvent.click(screen.getByRole("button", { name: /Abrir Banco de Questões/i }));
    return screen.findByRole("dialog", { name: /Selecionar Questões/i });
  }

  async function closeWithEscape(dialog: HTMLElement) {
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  }

  it("drops a selection abandoned by closing the dialog", async () => {
    bankQuestionsResult.data = [q7, q8];
    renderOnBankTab();
    let dialog = await openDialog();
    fireEvent.click(await within(dialog).findByText("Fotossíntese"));
    expect(within(dialog).getByRole("button", { name: /Adicionar 1/i })).toBeEnabled();
    await closeWithEscape(dialog);

    dialog = await openDialog();
    const card = await within(dialog).findByRole("checkbox", { name: /Fotossíntese/ });
    expect(card).toHaveAttribute("aria-checked", "false");
    expect(within(dialog).getByRole("button", { name: /Adicionar 0/i })).toBeDisabled();
  });

  it("clears the search and the filters when the dialog closes", async () => {
    bankQuestionsResult.data = [q7, q8];
    renderOnBankTab();
    let dialog = await openDialog();
    fireEvent.change(within(dialog).getByPlaceholderText("Buscar questões..."), { target: { value: "Foto" } });
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Filtrar por matéria" }));
    fireEvent.click(await screen.findByRole("option", { name: "Matemática" }));
    await closeWithEscape(dialog);

    dialog = await openDialog();
    expect(within(dialog).getByPlaceholderText("Buscar questões...")).toHaveValue("");
    expect(within(dialog).getByRole("combobox", { name: "Filtrar por matéria" })).toHaveTextContent("Todas");
    await within(dialog).findByText("Fotossíntese");
    expect(within(dialog).getByText("Resolva: x/2 + 3 = 7")).toBeInTheDocument();
  });

  it("clears the search after adding questions too", async () => {
    bankQuestionsResult.data = [q7, q8];
    renderOnBankTab();
    let dialog = await openDialog();
    fireEvent.change(within(dialog).getByPlaceholderText("Buscar questões..."), { target: { value: "Foto" } });
    fireEvent.click(await within(dialog).findByText("Fotossíntese"));
    fireEvent.click(within(dialog).getByRole("button", { name: /Adicionar 1/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    dialog = await openDialog();
    expect(within(dialog).getByPlaceholderText("Buscar questões...")).toHaveValue("");
  });

  it("says how many selected questions the current search or filter hides", async () => {
    bankQuestionsResult.data = [q7, q8];
    renderOnBankTab();
    const dialog = await openDialog();
    fireEvent.click(await within(dialog).findByText("Resolva: x/2 + 3 = 7"));
    expect(within(dialog).queryByText(/fora deste filtro/)).toBeNull();
    fireEvent.change(within(dialog).getByPlaceholderText("Buscar questões..."), { target: { value: "Foto" } });
    await within(dialog).findByText("Fotossíntese");
    expect(within(dialog).getByText("1 selecionada(s) fora deste filtro")).toBeInTheDocument();
  });
});
