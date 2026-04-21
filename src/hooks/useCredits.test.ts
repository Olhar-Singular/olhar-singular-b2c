import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useTransactionHistory, useCreateCheckout } from "./useCredits";
import { supabase } from "@/integrations/supabase/client";

const mockTransactions = [
  {
    id: "t1",
    user_id: "u1",
    delta: -1,
    type: "adapt",
    ref_id: null,
    payment_id: null,
    created_at: "2026-04-20T10:00:00Z",
  },
  {
    id: "t2",
    user_id: "u1",
    delta: 10,
    type: "signup_bonus",
    ref_id: null,
    payment_id: null,
    created_at: "2026-04-19T10:00:00Z",
  },
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useTransactionHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns transactions ordered by created_at desc", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: mockTransactions, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => useTransactionHistory(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockTransactions);
    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("returns empty array when no transactions", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => useTransactionHistory(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("limits to 50 transactions by default", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => useTransactionHistory(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(chain.limit).toHaveBeenCalledWith(50);
  });
});

describe("useCreateCheckout", () => {
  const mockInvoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as { location?: unknown }).location;
    (window as { location: unknown }).location = { href: "" };
  });

  it("invokes create-checkout with credits and amountBrl", async () => {
    mockInvoke.mockResolvedValue({ data: { url: "https://mp.test/checkout" }, error: null });

    const { result } = renderHook(() => useCreateCheckout(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ credits: 30, amountBrl: 9.9 });
    });

    expect(mockInvoke).toHaveBeenCalledWith("create-checkout", {
      body: { credits: 30, amountBrl: 9.9 },
    });
  });

  it("redirects to url on success", async () => {
    mockInvoke.mockResolvedValue({ data: { url: "https://mp.test/checkout" }, error: null });

    const { result } = renderHook(() => useCreateCheckout(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ credits: 30, amountBrl: 9.9 });
    });

    expect(window.location.href).toBe("https://mp.test/checkout");
  });

  it("calls toast.error when invoke returns error", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockResolvedValue({ data: null, error: new Error("falha no servidor") });

    const { result } = renderHook(() => useCreateCheckout(), { wrapper });
    await act(async () => {
      try { await result.current.mutateAsync({ credits: 30, amountBrl: 9.9 }); } catch { /* expected */ }
    });

    expect(toast.error).toHaveBeenCalled();
  });
});
