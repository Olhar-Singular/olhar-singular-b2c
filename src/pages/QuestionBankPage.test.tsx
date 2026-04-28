import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuestionBankPage from "./QuestionBankPage";

const mockUseQuestions = vi.fn(() => ({ data: [], isLoading: false, isSuccess: true }));
const mockUseAuthContext = vi.fn(() => ({
  user: { id: "u1" },
  profile: { credit_balance: 10, free_extraction_used: false },
  refreshProfile: vi.fn(),
}));

vi.mock("@/hooks/useQuestionBank", () => ({
  useQuestions: (...args: any[]) => mockUseQuestions(...args),
  useDeleteQuestion: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useQuestionStats: vi.fn(() => ({ data: { total: 0, bySubject: {} }, isLoading: false })),
  useInsertQuestions: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuthContext: (...args: any[]) => mockUseAuthContext(...args),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/dialogs/QuestionExtractModal", () => ({
  default: () => null,
}));

vi.mock("@/components/forms/ManualQuestionEditor", () => ({
  default: () => null,
}));

vi.mock("@/components/forms/QuestionForm", () => ({
  default: () => null,
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("QuestionBankPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuestions.mockReturnValue({ data: [], isLoading: false, isSuccess: true });
    mockUseAuthContext.mockReturnValue({
      user: { id: "u1" },
      profile: { credit_balance: 10, free_extraction_used: false },
      refreshProfile: vi.fn(),
    });
  });

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
      refreshProfile: vi.fn(),
    });
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByText(/10/)).toBeInTheDocument();
  });

  it("shows empty state when no questions", () => {
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByText(/nenhuma questão/i)).toBeInTheDocument();
  });

  it("disables extract button when no credits and free extraction used", () => {
    mockUseAuthContext.mockReturnValue({
      user: { id: "u1" },
      profile: { credit_balance: 0, free_extraction_used: true },
      refreshProfile: vi.fn(),
    });

    render(<QuestionBankPage />, { wrapper });
    const btn = screen.getByRole("button", { name: /extrair questões/i });
    expect(btn).toBeDisabled();
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

  it("renders multiple difficulty badges with localized labels", () => {
    mockUseQuestions.mockReturnValue({
      data: [
        { id: "q1", text: "Q1", subject: "Física", topic: null, difficulty: "facil", options: null, correct_answer: null, created_at: "2026-01-01" },
        { id: "q2", text: "Q2", subject: "Física", topic: null, difficulty: "medio", options: null, correct_answer: null, created_at: "2026-01-01" },
        { id: "q3", text: "Q3", subject: "Física", topic: null, difficulty: "dificil", options: null, correct_answer: null, created_at: "2026-01-01" },
      ],
      isLoading: false,
      isSuccess: true,
    });
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByText("Fácil")).toBeInTheDocument();
    expect(screen.getByText("Médio")).toBeInTheDocument();
    expect(screen.getByText("Difícil")).toBeInTheDocument();
  });

  it("renders Editor Manual button", () => {
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByRole("button", { name: /Editor Manual/i })).toBeInTheDocument();
  });

  it("opens manual editor mode when Editor Manual selects a file", async () => {
    const origCreate = document.createElement.bind(document);
    let createdInput: HTMLInputElement | null = null;
    document.createElement = ((tag: string) => {
      const el = origCreate(tag);
      if (tag === "input") {
        createdInput = el as HTMLInputElement;
        Object.defineProperty(el, "click", { value: vi.fn() });
      }
      return el;
    }) as typeof document.createElement;
    try {
      render(<QuestionBankPage />, { wrapper });
      const btn = screen.getByRole("button", { name: /Editor Manual/i });
      btn.click();
      expect(createdInput).not.toBeNull();
    } finally {
      document.createElement = origCreate;
    }
  });

  it("renders Objetiva badge when a question has options", () => {
    mockUseQuestions.mockReturnValue({
      data: [
        { id: "q1", text: "Q?", subject: "Física", topic: null, difficulty: "medio", options: ["A", "B"], correct_answer: 0, created_at: "2026-01-01" },
      ],
      isLoading: false,
      isSuccess: true,
    });
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByText(/Objetiva/i)).toBeInTheDocument();
  });

  it("renders question image when image_url is set", () => {
    mockUseQuestions.mockReturnValue({
      data: [
        { id: "q1", text: "Q?", subject: "Física", topic: null, difficulty: "medio", image_url: "https://x.png", options: null, correct_answer: null, created_at: "2026-01-01" },
      ],
      isLoading: false,
      isSuccess: true,
    });
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByAltText(/Imagem da questão/i)).toBeInTheDocument();
  });

  it("filter empty state shows distinct copy when search is set", () => {
    mockUseQuestions.mockReturnValue({ data: [], isLoading: false, isSuccess: true });
    render(<QuestionBankPage />, { wrapper });
    const searchInput = screen.getByPlaceholderText(/Buscar/i);
    fireEvent.change(searchInput, { target: { value: "xyz" } });
    expect(screen.getByText(/ajustar os filtros/i)).toBeInTheDocument();
  });

  it("Extrair Questões button is enabled when free extraction is available", () => {
    render(<QuestionBankPage />, { wrapper });
    expect(screen.getByRole("button", { name: /Extrair Quest/i })).not.toBeDisabled();
  });

  it("Nova Questão button is rendered and clickable", () => {
    render(<QuestionBankPage />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /Nova Quest/i }));
    expect(screen.getByText(/banco de questões/i)).toBeInTheDocument();
  });
});
