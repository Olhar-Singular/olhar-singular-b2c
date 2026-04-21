import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useSendMessage } from "./useSendMessage";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "tok-abc" } } }),
    },
  },
}));

import { supabase } from "@/integrations/supabase/client";
const mockGetSession = supabase.auth.getSession as ReturnType<typeof vi.fn>;

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
vi.stubGlobal("import.meta", { env: { VITE_SUPABASE_URL: "http://localhost:54321" } });

const baseInput = {
  messages: [{ role: "user" as const, content: "Como adaptar para TEA?" }],
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useSendMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "tok-abc" } } });
  });

  it("creates new session and returns reply + session_id + title", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply: "Aqui estão algumas estratégias...", session_id: "sess-1", title: "Como adaptar para TEA?" }),
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper });
    await act(async () => { result.current.mutate(baseInput); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.reply).toContain("estratégias");
    expect(result.current.data?.session_id).toBe("sess-1");
    expect(result.current.data?.title).toBe("Como adaptar para TEA?");

    const call = mockFetch.mock.calls[0];
    expect((call[0] as string)).toContain("/functions/v1/chat");
    const body = JSON.parse(call[1].body);
    expect(body.session_id).toBeUndefined();
  });

  it("sends to existing session without session_id in body expectations", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply: "Continuando...", session_id: "sess-1" }),
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper });
    await act(async () => {
      result.current.mutate({ ...baseInput, session_id: "sess-1" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.session_id).toBe("sess-1");
  });

  it("throws credit error on 402", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: async () => ({ error: "Créditos insuficientes.", balance: 0 }),
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper });
    await act(async () => { result.current.mutate(baseInput); });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toMatch(/crédito/i);
  });

  it("throws session limit error on 429", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: "Limite de 10 conversas atingido. Exclua uma conversa antiga para iniciar uma nova." }),
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper });
    await act(async () => { result.current.mutate(baseInput); });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toMatch(/limite/i);
  });

  it("invalidates chat-sessions query on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply: "Ok.", session_id: "sess-2" }),
    });

    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const w = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useSendMessage(), { wrapper: w });
    await act(async () => { result.current.mutate(baseInput); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["chat-sessions"] });
  });
});
