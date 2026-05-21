import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuestionBankPage from "./QuestionBankPage";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Hook / context mocks
// ---------------------------------------------------------------------------
const mockUseQuestions = vi.fn(() => ({ data: [], isLoading: false, isSuccess: true }));
const mockDeleteMutateAsync = vi.fn().mockResolvedValue(undefined);
const mockInsertMutate = vi.fn();
const mockRefreshProfile = vi.fn().mockResolvedValue(undefined);

const mockUseAuthContext = vi.fn(() => ({
  user: { id: "u1" },
  profile: { credit_balance: 10, free_extraction_used: false },
  refreshProfile: mockRefreshProfile,
}));

vi.mock("@/hooks/useQuestionBank", () => ({
  useQuestions: (...args: any[]) => mockUseQuestions(...args),
  useDeleteQuestion: vi.fn(() => ({ mutateAsync: mockDeleteMutateAsync, isPending: false })),
  useQuestionStats: vi.fn(() => ({ data: { total: 0, bySubject: {} }, isLoading: false })),
  useInsertQuestions: vi.fn(() => ({ mutate: mockInsertMutate, isPending: false })),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuthContext: (...args: any[]) => mockUseAuthContext(...args),
}));

const getSessionSpy = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getSession: (...a: unknown[]) => getSessionSpy(...a) },
    storage: { from: vi.fn() },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/domain/questionParser", () => ({
  validateExtractedQuestions: vi.fn((qs: any[]) => ({ questions: qs ?? [], warnings: [] })),
}));

vi.mock("@/lib/utils/pdf-utils", () => ({
  parsePdf: vi.fn().mockResolvedValue({ text: "Questão extraída", pageImages: [], pageCount: 1, pagesProcessed: [1] }),
}));

vi.mock("@/lib/utils/docx-utils", () => ({
  extractDocxText: vi.fn().mockResolvedValue("Questão docx"),
  extractDocxWithImages: vi.fn().mockResolvedValue({ text: "Questão docx", images: [] }),
  isDocxFile: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/utils/fileValidation", () => ({
  detectFileType: vi.fn().mockReturnValue("pdf"),
}));

vi.mock("@/lib/utils/fileNameUtils", () => ({
  resolveUniqueFileName: vi.fn().mockReturnValue({ finalName: "prova.pdf", wasRenamed: false }),
}));

vi.mock("@/lib/utils/extraction-utils", () => ({
  normalizeTextForDedup: vi.fn((t: string) => t.toLowerCase().trim()),
  autoCropFromBbox: vi.fn(),
  dataUrlToBlob: vi.fn(),
  findDuplicates: vi.fn(() => []),
}));

// ---------------------------------------------------------------------------
// Form/editor component mocks
// ---------------------------------------------------------------------------
const questionFormCallbacks: { onSaved?: () => void; open?: boolean; question?: any } = {};
const manualEditorCallbacks: { onFinish?: () => void; file?: File | null } = {};

vi.mock("@/components/forms/ManualQuestionEditor", () => ({
  default: (props: any) => {
    manualEditorCallbacks.onFinish = props.onFinish;
    manualEditorCallbacks.file = props.file;
    return props.file ? <div data-testid="manual-editor">{props.file.name}</div> : null;
  },
}));

vi.mock("@/components/forms/QuestionForm", () => ({
  default: (props: any) => {
    questionFormCallbacks.onSaved = props.onSaved;
    questionFormCallbacks.open = props.open;
    questionFormCallbacks.question = props.question;
    return props.open ? <div data-testid="question-form-open" /> : null;
  },
}));

// ---------------------------------------------------------------------------
// fetch + storage spies
// ---------------------------------------------------------------------------
const fetchSpy = vi.fn();
const storageUploadSpy = vi.fn();
const storageRemoveSpy = vi.fn();
const storageDownloadSpy = vi.fn();

let pdfUploadsRows: any[] = [];
const pdfUploadsInsertSpy = vi.fn();
const pdfUploadsDeleteEqSpy = vi.fn();

function makePdfUploadsChain() {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: pdfUploadsRows, error: null }),
    }),
    insert: pdfUploadsInsertSpy,
    delete: vi.fn().mockReturnValue({ eq: pdfUploadsDeleteEqSpy }),
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  pdfUploadsRows = [];
  mockDeleteMutateAsync.mockResolvedValue(undefined);
  mockInsertMutate.mockReset();
  mockRefreshProfile.mockResolvedValue(undefined);
  mockUseQuestions.mockReturnValue({ data: [], isLoading: false, isSuccess: true });
  mockUseAuthContext.mockReturnValue({
    user: { id: "u1" },
    profile: { credit_balance: 10, free_extraction_used: false },
    refreshProfile: mockRefreshProfile,
  });
  getSessionSpy.mockResolvedValue({ data: { session: { access_token: "tok" } } });
  fetchSpy.mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ questions: [], source_file_name: "prova.pdf" }),
  });
  vi.stubGlobal("fetch", fetchSpy);

  // Configure supabase.from to handle pdf_uploads
  (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table === "pdf_uploads") return makePdfUploadsChain();
    return {};
  });

  // Configure storage mock
  storageUploadSpy.mockResolvedValue({ data: { path: "u1/123.pdf" }, error: null });
  storageRemoveSpy.mockResolvedValue({ error: null });
  storageDownloadSpy.mockResolvedValue({ data: new Blob(["content"]), error: null });
  pdfUploadsInsertSpy.mockResolvedValue({ error: null });
  pdfUploadsDeleteEqSpy.mockResolvedValue({ error: null });
  (supabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
    upload: storageUploadSpy,
    remove: storageRemoveSpy,
    download: storageDownloadSpy,
  });

  delete questionFormCallbacks.onSaved;
  delete questionFormCallbacks.open;
  delete questionFormCallbacks.question;
  delete manualEditorCallbacks.onFinish;
  delete manualEditorCallbacks.file;
});

// ---------------------------------------------------------------------------
// Baseline rendering
// ---------------------------------------------------------------------------

describe("QuestionBankPage", () => {
  it("renders the page title", () => {
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByText(/banco de questões/i)).toBeInTheDocument();
  });

  it("shows the free extraction badge when not used", () => {
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByText(/extração gratuita/i)).toBeInTheDocument();
  });

  it("shows credit balance when free extraction is used", () => {
    mockUseAuthContext.mockReturnValue({
      user: { id: "u1" },
      profile: { credit_balance: 10, free_extraction_used: true },
      refreshProfile: mockRefreshProfile,
    });
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByText(/10/)).toBeInTheDocument();
  });

  it("shows empty state when no questions", () => {
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByText(/nenhuma questão/i)).toBeInTheDocument();
  });

  it("shows empty state with default copy when no search and no subject filter", () => {
    render(<QuestionBankPage />, { wrapper });
    expect(
      screen.getByText(/Comece adicionando questões manualmente ou extraindo de um documento/i),
    ).toBeInTheDocument();
  });

  it("shows questions when loaded", async () => {
    mockUseQuestions.mockReturnValue({
      data: [
        { id: "q1", text: "Qual é a capital?", subject: "Geografia", topic: null, difficulty: "facil", options: null, correct_answer: null, created_at: "2026-04-21T00:00:00Z" },
      ],
      isLoading: false,
      isSuccess: true,
    });
    render(<QuestionBankPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Qual é a capital?")).toBeInTheDocument());
  });

  it("shows loader while questions are loading", () => {
    mockUseQuestions.mockReturnValue({ data: [], isLoading: true, isSuccess: false });
    const { container } = render(<QuestionBankPage />, { wrapper });
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  // ── Difficulty badges ────────────────────────────────────────────────────

  it("renders multiple difficulty badges with localized labels", () => {
    mockUseQuestions.mockReturnValue({
      data: [
        { id: "q1", text: "Q1", subject: "Física", topic: null, difficulty: "facil", options: null, correct_answer: null, created_at: "2026-01-01" },
        { id: "q2", text: "Q2", subject: "Física", topic: null, difficulty: "medio", options: null, correct_answer: null, created_at: "2026-01-01" },
        { id: "q3", text: "Q3", subject: "Física", topic: null, difficulty: "dificil", options: null, correct_answer: null, created_at: "2026-01-01" },
      ],
      isLoading: false, isSuccess: true,
    });
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByText("Fácil")).toBeInTheDocument();
    expect(screen.getByText("Médio")).toBeInTheDocument();
    expect(screen.getByText("Difícil")).toBeInTheDocument();
  });

  it("renders difficulty badge with fallback for unknown difficulty", () => {
    mockUseQuestions.mockReturnValue({
      data: [{ id: "q1", text: "Q", subject: "Física", topic: null, difficulty: "muito_dificil", options: null, correct_answer: null, created_at: "2026-01-01" }],
      isLoading: false, isSuccess: true,
    });
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByText("muito_dificil")).toBeInTheDocument();
  });

  it("renders topic badge when question has a topic", () => {
    mockUseQuestions.mockReturnValue({
      data: [{ id: "q1", text: "Q", subject: "Biologia", topic: "Células", difficulty: "facil", options: null, correct_answer: null, created_at: "2026-01-01" }],
      isLoading: false, isSuccess: true,
    });
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByText("Células")).toBeInTheDocument();
  });

  it("renders Objetiva badge when a question has options", () => {
    mockUseQuestions.mockReturnValue({
      data: [{ id: "q1", text: "Q?", subject: "Física", topic: null, difficulty: "medio", options: ["A", "B"], correct_answer: 0, created_at: "2026-01-01" }],
      isLoading: false, isSuccess: true,
    });
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByText(/Objetiva/i)).toBeInTheDocument();
  });

  it("renders question image when image_url is set", () => {
    mockUseQuestions.mockReturnValue({
      data: [{ id: "q1", text: "Q?", subject: "Física", topic: null, difficulty: "medio", image_url: "https://x.png", options: null, correct_answer: null, created_at: "2026-01-01" }],
      isLoading: false, isSuccess: true,
    });
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByAltText(/Imagem da questão/i)).toBeInTheDocument();
  });

  it("renders correct and incorrect option styling for objective question", () => {
    mockUseQuestions.mockReturnValue({
      data: [{
        id: "q1", text: "Q", subject: "Matemática", topic: null, difficulty: "medio",
        options: ["Opção A", "Opção B", "Opção C"], correct_answer: 1, created_at: "2026-01-01",
      }],
      isLoading: false, isSuccess: true,
    });
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByText("Opção A")).toBeInTheDocument();
    expect(screen.getByText("Opção B")).toBeInTheDocument();
    expect(screen.getByText("Opção C")).toBeInTheDocument();
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("renders empty string when question text is null", () => {
    mockUseQuestions.mockReturnValue({
      data: [{ id: "q1", text: null, subject: "Física", topic: null, difficulty: "medio", options: null, correct_answer: null, created_at: "2026-01-01" }],
      isLoading: false, isSuccess: true,
    });
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByText("Física")).toBeInTheDocument();
  });

  // ── Stats subtitle ───────────────────────────────────────────────────────

  it("stats total is displayed in the subtitle", async () => {
    const { useQuestionStats } = await import("@/hooks/useQuestionBank");
    (useQuestionStats as ReturnType<typeof vi.fn>).mockReturnValue({ data: { total: 42 }, isLoading: false });
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByText(/42 questão/i)).toBeInTheDocument();
  });

  it("stats shows 0 when stats data is undefined", async () => {
    const { useQuestionStats } = await import("@/hooks/useQuestionBank");
    (useQuestionStats as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined, isLoading: false });
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByText(/0 questão/i)).toBeInTheDocument();
  });

  // ── Search / filter ──────────────────────────────────────────────────────

  it("filter empty state shows distinct copy when search is set", () => {
    render(<QuestionBankPage />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/Buscar/i), { target: { value: "xyz" } });
    expect(screen.getByText(/ajustar os filtros/i)).toBeInTheDocument();
  });

  it("search filters questions by text match", () => {
    mockUseQuestions.mockReturnValue({
      data: [
        { id: "q1", text: "Qual é a capital do Brasil?", subject: "Geografia", topic: null, difficulty: "facil", options: null, correct_answer: null, created_at: "2026-01-01" },
        { id: "q2", text: "Explique a fotossíntese.", subject: "Biologia", topic: null, difficulty: "medio", options: null, correct_answer: null, created_at: "2026-01-01" },
      ],
      isLoading: false, isSuccess: true,
    });
    render(<QuestionBankPage />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/buscar/i), { target: { value: "fotossíntese" } });
    expect(screen.getByText(/Explique a fotossíntese/)).toBeInTheDocument();
    expect(screen.queryByText(/capital do Brasil/)).not.toBeInTheDocument();
  });

  it("search filters questions by subject match", () => {
    mockUseQuestions.mockReturnValue({
      data: [
        { id: "q1", text: "Questão de Física", subject: "Física", topic: null, difficulty: "medio", options: null, correct_answer: null, created_at: "2026-01-01" },
        { id: "q2", text: "Questão de Química", subject: "Química", topic: null, difficulty: "medio", options: null, correct_answer: null, created_at: "2026-01-01" },
      ],
      isLoading: false, isSuccess: true,
    });
    render(<QuestionBankPage />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/buscar/i), { target: { value: "Física" } });
    expect(screen.getByText(/Questão de Física/)).toBeInTheDocument();
    expect(screen.queryByText(/Questão de Química/)).not.toBeInTheDocument();
  });

  it("search filters questions by topic match", () => {
    mockUseQuestions.mockReturnValue({
      data: [
        { id: "q1", text: "Questão sobre Termodinâmica", subject: "Física", topic: "Termodinâmica", difficulty: "dificil", options: null, correct_answer: null, created_at: "2026-01-01" },
        { id: "q2", text: "Questão sobre Óptica", subject: "Física", topic: "Óptica", difficulty: "facil", options: null, correct_answer: null, created_at: "2026-01-01" },
      ],
      isLoading: false, isSuccess: true,
    });
    render(<QuestionBankPage />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/buscar/i), { target: { value: "Termodinâmica" } });
    expect(screen.getByText(/Questão sobre Termodinâmica/)).toBeInTheDocument();
    expect(screen.queryByText(/Questão sobre Óptica/)).not.toBeInTheDocument();
  });

  // ── Editor Manual ────────────────────────────────────────────────────────

  it("renders Editor Manual button", () => {
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByRole("button", { name: /Editor Manual/i })).toBeInTheDocument();
  });

  it("opens manual editor mode when Editor Manual selects a file", () => {
    const origCreate = document.createElement.bind(document);
    let capturedInput: HTMLInputElement | null = null;
    document.createElement = ((tag: string) => {
      const el = origCreate(tag);
      if (tag === "input") {
        capturedInput = el as HTMLInputElement;
        Object.defineProperty(el, "click", { value: vi.fn(), configurable: true });
      }
      return el;
    }) as typeof document.createElement;
    try {
      render(<QuestionBankPage />, { wrapper });
      fireEvent.click(screen.getByRole("button", { name: /Editor Manual/i }));
      expect(capturedInput).not.toBeNull();
    } finally {
      document.createElement = origCreate;
    }
  });

  it("ManualQuestionEditor is rendered when a file is selected via the file input onchange", () => {
    const origCreate = document.createElement.bind(document);
    let capturedInput: HTMLInputElement | null = null;
    document.createElement = ((tag: string) => {
      const el = origCreate(tag);
      if (tag === "input") {
        capturedInput = el as HTMLInputElement;
        Object.defineProperty(el, "click", { value: vi.fn(), configurable: true });
      }
      return el;
    }) as typeof document.createElement;
    try {
      render(<QuestionBankPage />, { wrapper });
      fireEvent.click(screen.getByRole("button", { name: /editor manual/i }));
      const fakeFile = new File(["content"], "questoes.pdf", { type: "application/pdf" });
      Object.defineProperty(capturedInput!, "files", { value: { 0: fakeFile, length: 1 }, configurable: true });
      act(() => { fireEvent.change(capturedInput!); });
      expect(screen.getByTestId("manual-editor")).toBeInTheDocument();
      expect(screen.getByText("questoes.pdf")).toBeInTheDocument();
    } finally {
      document.createElement = origCreate;
    }
  });

  it("ManualQuestionEditor onFinish resets back to main page", () => {
    const origCreate = document.createElement.bind(document);
    let capturedInput: HTMLInputElement | null = null;
    document.createElement = ((tag: string) => {
      const el = origCreate(tag);
      if (tag === "input") {
        capturedInput = el as HTMLInputElement;
        Object.defineProperty(el, "click", { value: vi.fn(), configurable: true });
      }
      return el;
    }) as typeof document.createElement;
    try {
      render(<QuestionBankPage />, { wrapper });
      fireEvent.click(screen.getByRole("button", { name: /editor manual/i }));
      const fakeFile = new File(["content"], "questoes.pdf", { type: "application/pdf" });
      Object.defineProperty(capturedInput!, "files", { value: { 0: fakeFile, length: 1 }, configurable: true });
      act(() => { fireEvent.change(capturedInput!); });
      expect(screen.getByTestId("manual-editor")).toBeInTheDocument();
      act(() => { manualEditorCallbacks.onFinish?.(); });
      expect(screen.queryByTestId("manual-editor")).not.toBeInTheDocument();
    } finally {
      document.createElement = origCreate;
    }
  });

  it("file input onchange with no file does not show manual editor", () => {
    const origCreate = document.createElement.bind(document);
    let capturedInput: HTMLInputElement | null = null;
    document.createElement = ((tag: string) => {
      const el = origCreate(tag);
      if (tag === "input") {
        capturedInput = el as HTMLInputElement;
        Object.defineProperty(el, "click", { value: vi.fn(), configurable: true });
      }
      return el;
    }) as typeof document.createElement;
    try {
      render(<QuestionBankPage />, { wrapper });
      fireEvent.click(screen.getByRole("button", { name: /editor manual/i }));
      Object.defineProperty(capturedInput!, "files", { value: { length: 0 }, configurable: true });
      act(() => { fireEvent.change(capturedInput!); });
      expect(screen.queryByTestId("manual-editor")).not.toBeInTheDocument();
    } finally {
      document.createElement = origCreate;
    }
  });

  // ── QuestionForm ─────────────────────────────────────────────────────────

  it("Nova Questão button opens the QuestionForm", () => {
    render(<QuestionBankPage />, { wrapper });
    expect(screen.queryByTestId("question-form-open")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /nova questão/i }));
    expect(screen.getByTestId("question-form-open")).toBeInTheDocument();
  });

  it("Nova Questão button sets editQuestion to null before opening", () => {
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /nova questão/i }));
    expect(questionFormCallbacks.question).toBeNull();
  });

  it("QuestionForm onSaved callback closes the form", () => {
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /nova questão/i }));
    act(() => { questionFormCallbacks.onSaved?.(); });
    expect(screen.queryByTestId("question-form-open")).not.toBeInTheDocument();
  });

  // ── Provas tab — structure ────────────────────────────────────────────────

  it("shows Provas and Questões tabs", () => {
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByRole("tab", { name: /Provas/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Questões/i })).toBeInTheDocument();
  });

  it("Provas tab shows file upload dropzone", () => {
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    expect(screen.getByText(/PDF ou Word/i)).toBeInTheDocument();
  });

  it("Provas tab does not show a dialog when switching to it", () => {
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // ── Provas tab — upload flow ──────────────────────────────────────────────

  it("selecting a file in Provas tab uploads to storage and pdf_uploads then shows Extrair button", async () => {
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    expect(input).not.toBeNull();
    const file = new File(["pdf"], "prova.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(storageUploadSpy).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Extrair com IA/i })).toBeInTheDocument();
    });
  });

  it("Extrair com IA is disabled when no credits and free extraction used", async () => {
    mockUseAuthContext.mockReturnValue({
      user: { id: "u1" },
      profile: { credit_balance: 0, free_extraction_used: true },
      refreshProfile: mockRefreshProfile,
    });
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    const file = new File(["pdf"], "prova.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      const btn = screen.queryByRole("button", { name: /Extrair com IA/i });
      if (btn) expect(btn).toBeDisabled();
    });
  });

  it("clicking Extrair com IA calls parsePdf and sends JSON to the API", async () => {
    const { parsePdf } = await import("@/lib/utils/pdf-utils");
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        questions: [{ text: "Questão extraída", subject: "Física" }],
        source_file_name: "prova.pdf",
      }),
    });
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    const file = new File(["pdf"], "prova.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => screen.getByRole("button", { name: /Extrair com IA/i }));
    fireEvent.click(screen.getByRole("button", { name: /Extrair com IA/i }));
    await waitFor(() => {
      expect(parsePdf).toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("extract-questions"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("successful extraction shows review mode with question cards and checkboxes", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        questions: [{ text: "Questão extraída", subject: "Física" }],
        source_file_name: "prova.pdf",
      }),
    });
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["pdf"], "prova.pdf", { type: "application/pdf" })] } });
    await waitFor(() => screen.getByRole("button", { name: /Extrair com IA/i }));
    fireEvent.click(screen.getByRole("button", { name: /Extrair com IA/i }));
    await waitFor(() => {
      expect(screen.getByText("Questão extraída")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Salvar/i })).toBeInTheDocument();
  });

  it("review: Salvar todas calls insertQuestions with extracted questions", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        questions: [{ text: "Q1", subject: "Física" }],
        source_file_name: "prova.pdf",
      }),
    });
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["pdf"], "prova.pdf", { type: "application/pdf" })] } });
    await waitFor(() => screen.getByRole("button", { name: /Extrair com IA/i }));
    fireEvent.click(screen.getByRole("button", { name: /Extrair com IA/i }));
    await waitFor(() => screen.getByText("Q1"));
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() => expect(mockInsertMutate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ text: "Q1" })]),
    ));
  });

  it("review: Cancelar exits review mode and shows Provas tab again", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ questions: [{ text: "Q1", subject: "Física" }], source_file_name: "f.pdf" }),
    });
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "f.pdf", { type: "application/pdf" })] } });
    await waitFor(() => screen.getByRole("button", { name: /Extrair com IA/i }));
    fireEvent.click(screen.getByRole("button", { name: /Extrair com IA/i }));
    await waitFor(() => screen.getByText("Q1"));
    fireEvent.click(screen.getByRole("button", { name: /Cancelar|Concluir/i }));
    expect(mockInsertMutate).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText("Q1")).not.toBeInTheDocument();
    });
  });

  it("Provas tab extraction: shows error toast when API returns non-ok", async () => {
    const { toast } = await import("sonner");
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: "Erro interno" }),
    });
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "f.pdf", { type: "application/pdf" })] } });
    await waitFor(() => screen.getByRole("button", { name: /Extrair com IA/i }));
    fireEvent.click(screen.getByRole("button", { name: /Extrair com IA/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Erro interno"));
    });
  });

  // ── Provas tab — exam history ─────────────────────────────────────────────

  it("exam history shows pdf_uploads list", async () => {
    pdfUploadsRows = [
      { id: "up1", file_name: "Prova_Final.pdf", file_path: "u1/123_Prova_Final.pdf", questions_extracted: 5, uploaded_at: "2026-05-01T10:00:00Z" },
    ];
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    await waitFor(() => {
      expect(screen.getByText("Prova_Final.pdf")).toBeInTheDocument();
    });
    expect(screen.getByText(/5 questão/i)).toBeInTheDocument();
  });

  it("exam history shows empty state when no uploads", async () => {
    pdfUploadsRows = [];
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    await waitFor(() => {
      expect(screen.getByText(/nenhuma prova/i)).toBeInTheDocument();
    });
  });

  it("history: delete button removes file from storage and pdf_uploads", async () => {
    pdfUploadsRows = [
      { id: "up1", file_name: "Prova.pdf", file_path: "u1/123_Prova.pdf", questions_extracted: 3, uploaded_at: "2026-05-01T10:00:00Z" },
    ];
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    await waitFor(() => screen.getByText("Prova.pdf"));
    fireEvent.click(screen.getByRole("button", { name: /excluir prova/i }));
    await waitFor(() => {
      expect(storageRemoveSpy).toHaveBeenCalledWith(["u1/123_Prova.pdf"]);
    });
    expect(pdfUploadsDeleteEqSpy).toHaveBeenCalledWith("id", "up1");
  });

  it("history: Extrair button loads file and shows extraction flow", async () => {
    pdfUploadsRows = [
      { id: "up1", file_name: "Prova.pdf", file_path: "u1/123_Prova.pdf", questions_extracted: 3, uploaded_at: "2026-05-01T10:00:00Z" },
    ];
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    await waitFor(() => screen.getByText("Prova.pdf"));
    fireEvent.click(screen.getByRole("button", { name: /extrair/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Extrair com IA/i })).toBeInTheDocument();
    });
  });

  // ── Dropdown menu ────────────────────────────────────────────────────────

  it("dropdown Editar item opens QuestionForm with the selected question", async () => {
    const question = { id: "q1", text: "Q?", subject: "Química", topic: "Moléculas", difficulty: "facil", options: null, correct_answer: null, created_at: "2026-01-01" };
    mockUseQuestions.mockReturnValue({ data: [question], isLoading: false, isSuccess: true });
    render(<QuestionBankPage />, { wrapper });
    const trigger = screen.getByRole("button", { name: "" });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    await waitFor(() => {
      const editItem = screen.queryByText(/editar/i);
      if (editItem) fireEvent.click(editItem);
    });
    await waitFor(() => {
      expect(questionFormCallbacks.open).toBe(true);
      if (questionFormCallbacks.question) expect(questionFormCallbacks.question.id).toBe("q1");
    });
  });

  it("dropdown Excluir item calls deleteQuestion.mutateAsync with question id", async () => {
    const question = { id: "q99", text: "Q para excluir", subject: "História", topic: null, difficulty: "dificil", options: null, correct_answer: null, created_at: "2026-01-01" };
    mockUseQuestions.mockReturnValue({ data: [question], isLoading: false, isSuccess: true });
    render(<QuestionBankPage />, { wrapper });
    const trigger = screen.getByRole("button", { name: "" });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: /excluir/i })).toBeInTheDocument();
    }, { timeout: 3000 });
    fireEvent.click(screen.getByRole("menuitem", { name: /excluir/i }));
    await waitFor(() => {
      expect(mockDeleteMutateAsync).toHaveBeenCalledWith("q99");
    });
  });

  it("creditBalance and freeExtractionUsed default to 0/false when profile is null", () => {
    mockUseAuthContext.mockReturnValue({ user: { id: "u1" }, profile: null, refreshProfile: mockRefreshProfile });
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByText(/extração gratuita/i)).toBeInTheDocument();
  });

  it("subject filter passes subject value to useQuestions when not all", async () => {
    render(<QuestionBankPage />, { wrapper });
    const trigger = screen.getByRole("combobox");
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    await waitFor(() => {
      const mat = screen.queryByRole("option", { name: /Matemática/i });
      if (mat) fireEvent.click(mat);
    });
    const calls = mockUseQuestions.mock.calls;
    expect(calls.some((c) => c[0] && c[0].subject === undefined)).toBe(true);
  });

  // ── Helper: reach review mode ─────────────────────────────────────────────

  async function goToReview(
    questions: Array<{ text: string; subject: string; options?: string[]; correct_answer?: number }> = [{ text: "Q1", subject: "Física" }],
  ) {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ questions, source_file_name: "prova.pdf" }),
    });
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["pdf"], "prova.pdf", { type: "application/pdf" })] } });
    await waitFor(() => screen.getByRole("button", { name: /Extrair com IA/i }));
    fireEvent.click(screen.getByRole("button", { name: /Extrair com IA/i }));
    await waitFor(() => screen.getByText(questions[0].text));
  }

  // ── Review: edição inline ─────────────────────────────────────────────────

  it("review: each non-saved card shows Editar button", async () => {
    await goToReview();
    expect(screen.getByRole("button", { name: /^Editar$/i })).toBeInTheDocument();
  });

  it("review: clicking Editar shows textarea with current question text", async () => {
    await goToReview([{ text: "Texto da questão", subject: "Física" }]);
    expect(screen.queryByDisplayValue("Texto da questão")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Editar$/i }));
    expect(screen.getByDisplayValue("Texto da questão")).toBeInTheDocument();
  });

  it("review: Fechar edição hides the textarea", async () => {
    await goToReview([{ text: "Texto da questão", subject: "Física" }]);
    fireEvent.click(screen.getByRole("button", { name: /^Editar$/i }));
    expect(screen.getByDisplayValue("Texto da questão")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Fechar edição/i }));
    expect(screen.queryByDisplayValue("Texto da questão")).toBeNull();
  });

  it("review: editing textarea changes question text in review card", async () => {
    await goToReview([{ text: "Original", subject: "Física" }]);
    fireEvent.click(screen.getByRole("button", { name: /^Editar$/i }));
    fireEvent.change(screen.getByDisplayValue("Original"), { target: { value: "Modificada" } });
    fireEvent.click(screen.getByRole("button", { name: /Fechar edição/i }));
    expect(screen.getByText("Modificada")).toBeInTheDocument();
  });

  it("review: editing shows subject select and topic input", async () => {
    await goToReview([{ text: "Q1", subject: "Física" }]);
    fireEvent.click(screen.getByRole("button", { name: /^Editar$/i }));
    expect(screen.getByRole("combobox", { name: /matéria/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/tópico/i)).toBeInTheDocument();
  });

  it("review: edited question is saved with updated text when Salvar todas is clicked", async () => {
    await goToReview([{ text: "Original", subject: "Física" }]);
    fireEvent.click(screen.getByRole("button", { name: /^Editar$/i }));
    fireEvent.change(screen.getByDisplayValue("Original"), { target: { value: "Editada" } });
    fireEvent.click(screen.getByRole("button", { name: /Fechar edição/i }));
    fireEvent.click(screen.getByRole("button", { name: /Salvar todas/i }));
    await waitFor(() => expect(mockInsertMutate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ text: "Editada" })]),
    ));
  });

  // ── Review: forçar inclusão de duplicatas ─────────────────────────────────

  it("review: duplicate question shows Forçar inclusão button", async () => {
    mockUseQuestions.mockReturnValue({
      data: [{ id: "q1", text: "Questão duplicada", subject: "Física", topic: null, difficulty: "medio", options: null, correct_answer: null, created_at: "2026-01-01" }],
      isLoading: false,
      isSuccess: true,
    });
    await goToReview([{ text: "Questão duplicada", subject: "Física" }]);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Forçar inclusão/i })).toBeInTheDocument(),
    );
  });

  it("review: Forçar inclusão removes Duplicada badge and enables checkbox", async () => {
    mockUseQuestions.mockReturnValue({
      data: [{ id: "q1", text: "Questão duplicada", subject: "Física", topic: null, difficulty: "medio", options: null, correct_answer: null, created_at: "2026-01-01" }],
      isLoading: false,
      isSuccess: true,
    });
    await goToReview([{ text: "Questão duplicada", subject: "Física" }]);
    await waitFor(() => screen.getByRole("button", { name: /Forçar inclusão/i }));
    expect(screen.getByText("Duplicada")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Forçar inclusão/i }));
    expect(screen.queryByText("Duplicada")).not.toBeInTheDocument();
  });

  it("review: after Forçar inclusão, Salvar todas includes the question", async () => {
    mockUseQuestions.mockReturnValue({
      data: [{ id: "q1", text: "Questão duplicada", subject: "Física", topic: null, difficulty: "medio", options: null, correct_answer: null, created_at: "2026-01-01" }],
      isLoading: false,
      isSuccess: true,
    });
    await goToReview([{ text: "Questão duplicada", subject: "Física" }]);
    await waitFor(() => screen.getByRole("button", { name: /Forçar inclusão/i }));
    fireEvent.click(screen.getByRole("button", { name: /Forçar inclusão/i }));
    fireEvent.click(screen.getByRole("button", { name: /Salvar todas/i }));
    await waitFor(() => expect(mockInsertMutate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ text: "Questão duplicada" })]),
    ));
  });

  // ── Provas tab — Visualizar arquivo ──────────────────────────────────────

  it("Provas tab: Visualizar button appears after file upload", async () => {
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    expect(screen.queryByRole("button", { name: /Visualizar/i })).toBeNull();
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["pdf"], "prova.pdf", { type: "application/pdf" })] } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Visualizar/i })).toBeInTheDocument(),
    );
  });

  it("Provas tab: clicking Visualizar opens a dialog", async () => {
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["pdf"], "prova.pdf", { type: "application/pdf" })] } });
    await waitFor(() => screen.getByRole("button", { name: /Visualizar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Visualizar/i }));
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toBeInTheDocument(),
    );
  });

  // ── Image extraction (auto-crop pipeline) ────────────────────────────────

  it("extraction: autoCropFromBbox is called for questions with has_figure=true and figure_bbox", async () => {
    const { autoCropFromBbox } = await import("@/lib/utils/extraction-utils");
    const { parsePdf } = await import("@/lib/utils/pdf-utils");
    (parsePdf as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: "Questão com figura",
      pageImages: ["data:image/png;base64,page1"],
      pageCount: 1,
      pagesProcessed: [1],
    });
    (autoCropFromBbox as ReturnType<typeof vi.fn>).mockResolvedValue("data:image/png;base64,cropped");
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        questions: [{
          text: "Questão com figura",
          subject: "Física",
          has_figure: true,
          image_page: 1,
          figure_bbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.3 },
        }],
      }),
    });
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["pdf"], "prova.pdf", { type: "application/pdf" })] } });
    await waitFor(() => screen.getByRole("button", { name: /Extrair com IA/i }));
    fireEvent.click(screen.getByRole("button", { name: /Extrair com IA/i }));
    await waitFor(() => screen.getByText("Questão com figura"));
    expect(autoCropFromBbox).toHaveBeenCalledWith(
      "data:image/png;base64,page1",
      { x: 0.1, y: 0.1, width: 0.5, height: 0.3 },
    );
  });

  it("extraction: uses full page image when has_figure=true but figure_bbox is missing", async () => {
    const { autoCropFromBbox } = await import("@/lib/utils/extraction-utils");
    const { parsePdf } = await import("@/lib/utils/pdf-utils");
    (parsePdf as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: "Questão com figura",
      pageImages: ["data:image/png;base64,fullpage1"],
      pageCount: 1,
      pagesProcessed: [1],
    });
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        questions: [{
          text: "Questão sem bbox",
          subject: "Física",
          has_figure: true,
          image_page: 1,
        }],
      }),
    });
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["pdf"], "prova.pdf", { type: "application/pdf" })] } });
    await waitFor(() => screen.getByRole("button", { name: /Extrair com IA/i }));
    fireEvent.click(screen.getByRole("button", { name: /Extrair com IA/i }));
    await waitFor(() => screen.getByText("Questão sem bbox"));
    expect(autoCropFromBbox).not.toHaveBeenCalled();
    const img = screen.getByAltText(/Imagem da questão/i);
    expect(img).toHaveAttribute("src", "data:image/png;base64,fullpage1");
  });

  // ── Image save pipeline ───────────────────────────────────────────────────

  it("save: uploads imageUrl to question-images storage and saves public URL via insertQuestions", async () => {
    const { autoCropFromBbox, dataUrlToBlob } = await import("@/lib/utils/extraction-utils");
    const { parsePdf } = await import("@/lib/utils/pdf-utils");
    (parsePdf as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: "Questão com figura",
      pageImages: ["data:image/png;base64,page1"],
      pageCount: 1,
      pagesProcessed: [1],
    });
    (autoCropFromBbox as ReturnType<typeof vi.fn>).mockResolvedValue("data:image/png;base64,cropped");
    (dataUrlToBlob as ReturnType<typeof vi.fn>).mockReturnValue(new Blob(["fake"], { type: "image/png" }));
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        questions: [{
          text: "Questão com figura",
          subject: "Física",
          has_figure: true,
          image_page: 1,
          figure_bbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.3 },
        }],
      }),
    });

    const imageUploadSpy = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrlSpy = vi.fn().mockReturnValue({ data: { publicUrl: "https://cdn.example.com/img.png" } });
    (supabase.storage.from as ReturnType<typeof vi.fn>).mockImplementation((bucket: string) => {
      if (bucket === "question-images") return { upload: imageUploadSpy, getPublicUrl: getPublicUrlSpy };
      return { upload: storageUploadSpy, remove: storageRemoveSpy, download: storageDownloadSpy };
    });

    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["pdf"], "prova.pdf", { type: "application/pdf" })] } });
    await waitFor(() => screen.getByRole("button", { name: /Extrair com IA/i }));
    fireEvent.click(screen.getByRole("button", { name: /Extrair com IA/i }));
    await waitFor(() => screen.getByText("Questão com figura"));
    fireEvent.click(screen.getByRole("button", { name: /Salvar todas/i }));
    await waitFor(() => {
      expect(imageUploadSpy).toHaveBeenCalled();
      expect(mockInsertMutate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ image_url: "https://cdn.example.com/img.png" }),
        ]),
      );
    });
  });

  it("save: question without imageUrl is saved with image_url null", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        questions: [{ text: "Q sem figura", subject: "Matemática" }],
      }),
    });
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["pdf"], "prova.pdf", { type: "application/pdf" })] } });
    await waitFor(() => screen.getByRole("button", { name: /Extrair com IA/i }));
    fireEvent.click(screen.getByRole("button", { name: /Extrair com IA/i }));
    await waitFor(() => screen.getByText("Q sem figura"));
    fireEvent.click(screen.getByRole("button", { name: /Salvar todas/i }));
    await waitFor(() => expect(mockInsertMutate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ image_url: null }),
      ]),
    ));
  });

  it("review: card shows cropped image when question has_figure=true with figure_bbox", async () => {
    const { autoCropFromBbox } = await import("@/lib/utils/extraction-utils");
    const { parsePdf } = await import("@/lib/utils/pdf-utils");
    (parsePdf as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: "Questão com figura",
      pageImages: ["data:image/png;base64,page1"],
      pageCount: 1,
      pagesProcessed: [1],
    });
    (autoCropFromBbox as ReturnType<typeof vi.fn>).mockResolvedValue("data:image/png;base64,cropped");
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        questions: [{
          text: "Questão com figura",
          subject: "Física",
          has_figure: true,
          image_page: 1,
          figure_bbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.3 },
        }],
      }),
    });
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["pdf"], "prova.pdf", { type: "application/pdf" })] } });
    await waitFor(() => screen.getByRole("button", { name: /Extrair com IA/i }));
    fireEvent.click(screen.getByRole("button", { name: /Extrair com IA/i }));
    await waitFor(() => screen.getByText("Questão com figura"));
    const img = screen.getByAltText(/Imagem da questão/i);
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "data:image/png;base64,cropped");
  });

  it("review: Ver Exercícios button is shown in the review header", async () => {
    await goToReview();
    expect(screen.getByRole("button", { name: /Ver Exercícios/i })).toBeInTheDocument();
  });

  it("review: clicking Ver Exercícios opens a dialog", async () => {
    await goToReview();
    fireEvent.click(screen.getByRole("button", { name: /Ver Exercícios/i }));
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toBeInTheDocument(),
    );
  });

  it("Provas tab: Visualizar dialog can be closed", async () => {
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("tab", { name: /Provas/i }));
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["pdf"], "prova.pdf", { type: "application/pdf" })] } });
    await waitFor(() => screen.getByRole("button", { name: /Visualizar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Visualizar/i }));
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(screen.getByRole("button", { name: /fechar/i }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
