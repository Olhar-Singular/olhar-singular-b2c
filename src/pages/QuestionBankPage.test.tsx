import { render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/components/QuestionExtractModal", () => ({
  default: () => null,
}));

vi.mock("@/components/ManualQuestionEditor", () => ({
  default: () => null,
}));

vi.mock("@/components/QuestionForm", () => ({
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
});
