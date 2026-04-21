import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import {
  useQuestions,
  useDeleteQuestion,
  useUpdateQuestion,
  useQuestionStats,
  useInsertQuestions,
} from "./useQuestionBank";
import { supabase } from "@/integrations/supabase/client";

const mockQuestions = [
  { id: "q1", text: "What is $E=mc^2$?", subject: "Física", topic: "Relatividade", difficulty: "dificil", created_by: "u1", created_at: "2026-04-21T00:00:00Z" },
  { id: "q2", text: "Solve: 2+2", subject: "Matemática", topic: null, difficulty: "facil", created_by: "u1", created_at: "2026-04-20T00:00:00Z" },
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const mockUseAuth = vi.fn(() => ({ user: { id: "u1" } as any }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useQuestions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches questions for the current user", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockQuestions, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => useQuestions({}), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockQuestions);
    expect(chain.eq).toHaveBeenCalledWith("created_by", "u1");
  });

  it("returns empty array when no questions found", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => useQuestions({}), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("applies subject filter when provided", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [mockQuestions[0]], error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => useQuestions({ subject: "Física" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(chain.eq).toHaveBeenCalledWith("subject", "Física");
  });

  it("is disabled when user is null", async () => {
    mockUseAuth.mockReturnValueOnce({ user: null } as any);

    const { result } = renderHook(() => useQuestions({}), { wrapper });
    expect(result.current.isPending).toBe(true);
    expect(result.current.isFetching).toBe(false);
  });
});

describe("useDeleteQuestion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls delete with the question id", async () => {
    const chain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => useDeleteQuestion(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("q1");
    });

    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("id", "q1");
  });

  it("throws when delete returns an error", async () => {
    const chain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: new Error("delete failed") }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => useDeleteQuestion(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync("q1")).rejects.toThrow("delete failed");
    });
  });
});

describe("useUpdateQuestion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls update with id and payload", async () => {
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => useUpdateQuestion(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "q1", payload: { subject: "Química" } });
    });

    expect(chain.update).toHaveBeenCalledWith({ subject: "Química" });
    expect(chain.eq).toHaveBeenCalledWith("id", "q1");
  });

  it("throws when update returns an error", async () => {
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: new Error("update failed") }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => useUpdateQuestion(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ id: "q1", payload: { subject: "Química" } })).rejects.toThrow("update failed");
    });
  });
});

describe("useQuestionStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns count per subject", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: mockQuestions,
        error: null,
      }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => useQuestionStats(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.total).toBe(2);
    expect(result.current.data?.bySubject["Física"]).toBe(1);
    expect(result.current.data?.bySubject["Matemática"]).toBe(1);
  });

  it("returns zero total when no questions", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => useQuestionStats(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total).toBe(0);
    expect(result.current.data?.bySubject).toEqual({});
  });
});

describe("useInsertQuestions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts rows with created_by set to current user", async () => {
    const chain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const rows = [
      { text: "Questão 1", subject: "Física" },
      { text: "Questão 2", subject: "Matemática" },
    ];

    const { result } = renderHook(() => useInsertQuestions(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(rows);
    });

    expect(chain.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ text: "Questão 1", created_by: "u1" }),
        expect.objectContaining({ text: "Questão 2", created_by: "u1" }),
      ])
    );
  });

  it("throws when insert returns an error", async () => {
    const chain = {
      insert: vi.fn().mockResolvedValue({ error: new Error("insert failed") }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => useInsertQuestions(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync([{ text: "Q", subject: "Física" }])).rejects.toThrow("insert failed");
    });
  });

  it("invalidates question_bank and question_bank_stats queries on success", async () => {
    const chain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const customWrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useInsertQuestions(), { wrapper: customWrapper });
    await act(async () => {
      await result.current.mutateAsync([{ text: "Q", subject: "Física" }]);
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(["question_bank"]) })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(["question_bank_stats"]) })
    );
  });
});
