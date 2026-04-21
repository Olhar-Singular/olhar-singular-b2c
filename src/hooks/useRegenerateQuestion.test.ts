import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useRegenerateQuestion } from "./useRegenerateQuestion";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "tok-123" } } }),
    },
  },
}));

import { supabase } from "@/integrations/supabase/client";
const mockGetSession = supabase.auth.getSession as ReturnType<typeof vi.fn>;

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const SUPABASE_URL = "http://localhost:54321";
vi.stubGlobal("import.meta", { env: { VITE_SUPABASE_URL: SUPABASE_URL } });

const baseInput = {
  question: { number: 1, type: "open_ended", statement: "Questão 1" },
  version_type: "directed" as const,
  activity_type: "exercício",
  barriers: [{ dimension: "tdah", barrier_key: "tdah_atencao_sustentada", is_active: true }],
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useRegenerateQuestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "tok-123" } } });
  });

  it("calls check-and-deduct-credits before regenerate-question", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, newBalance: 9 }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ question_dsl: "1) Nova questão\n[linhas:3]", changes_made: ["Simplificado enunciado"] }),
      });

    const { result } = renderHook(() => useRegenerateQuestion(), { wrapper });

    await act(async () => { result.current.mutate(baseInput); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const firstCall = mockFetch.mock.calls[0][0] as string;
    expect(firstCall).toContain("check-and-deduct-credits");
    const secondCall = mockFetch.mock.calls[1][0] as string;
    expect(secondCall).toContain("regenerate-question");
  });

  it("returns question_dsl and changes_made on success", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          question_dsl: "1) Questão regenerada\n[linhas:4]",
          changes_made: ["Enunciado mais claro", "Apoio adicionado"],
        }),
      });

    const { result } = renderHook(() => useRegenerateQuestion(), { wrapper });
    await act(async () => { result.current.mutate(baseInput); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.question_dsl).toContain("Questão regenerada");
    expect(result.current.data?.changes_made).toHaveLength(2);
  });

  it("throws with credit error message on 402", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: async () => ({ error: "insufficient_credits", balance: 0 }),
    });

    const { result } = renderHook(() => useRegenerateQuestion(), { wrapper });
    await act(async () => { result.current.mutate(baseInput); });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toMatch(/créditos/i);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws on error from regenerate function", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Erro na IA." }),
      });

    const { result } = renderHook(() => useRegenerateQuestion(), { wrapper });
    await act(async () => { result.current.mutate(baseInput); });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toMatch(/IA|regenerar/i);
  });
});
