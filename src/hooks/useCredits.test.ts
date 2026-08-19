import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import {
  useTransactionHistory,
  useCreateStripeCheckout,
  useCreatePixPayment,
  usePixPurchaseStatus,
  pixPollInterval,
  PIX_POLL_INTERVAL_MS,
} from "./useCredits";
import { supabase } from "@/integrations/supabase/client";
import { MSG_NETWORK } from "@/lib/utils/errors";

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

  it("propagates Supabase errors as failed query state", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    const { result } = renderHook(() => useTransactionHistory(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { message: string }).message).toBe("boom");
  });

  it("respects custom limit when provided", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    const { result } = renderHook(() => useTransactionHistory(20), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(chain.limit).toHaveBeenCalledWith(20);
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

describe("useCreateStripeCheckout", () => {
  const mockInvoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as { location?: unknown }).location;
    (window as { location: unknown }).location = { href: "" };
  });

  it("invokes create-stripe-checkout with credits and amountBrl", async () => {
    mockInvoke.mockResolvedValue({ data: { url: "https://stripe.test/checkout" }, error: null });

    const { result } = renderHook(() => useCreateStripeCheckout(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ credits: 120, amountBrl: 29.9 });
    });

    expect(mockInvoke).toHaveBeenCalledWith("create-stripe-checkout", {
      body: { credits: 120, amountBrl: 29.9 },
    });
  });

  // Both rails go through the same function; only the method field differs.
  it("forwards the Pix payment method to the same edge function", async () => {
    mockInvoke.mockResolvedValue({ data: { url: "https://stripe.test/pix" }, error: null });

    const { result } = renderHook(() => useCreateStripeCheckout(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ credits: 30, amountBrl: 9.9, method: "pix" });
    });

    expect(mockInvoke).toHaveBeenCalledWith("create-stripe-checkout", {
      body: { credits: 30, amountBrl: 9.9, method: "pix" },
    });
  });

  it("redirects to the Stripe url on success", async () => {
    mockInvoke.mockResolvedValue({ data: { url: "https://stripe.test/checkout" }, error: null });

    const { result } = renderHook(() => useCreateStripeCheckout(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ credits: 120, amountBrl: 29.9 });
    });

    expect(window.location.href).toBe("https://stripe.test/checkout");
  });

  it("calls toast.error when invoke returns error", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockResolvedValue({ data: null, error: new Error("falha no servidor") });

    const { result } = renderHook(() => useCreateStripeCheckout(), { wrapper });
    await act(async () => {
      try { await result.current.mutateAsync({ credits: 120, amountBrl: 29.9 }); } catch { /* expected */ }
    });

    expect(toast.error).toHaveBeenCalled();
  });

  it("maps a raw network rejection to the friendly connection message", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useCreateStripeCheckout(), { wrapper });
    await act(async () => {
      try { await result.current.mutateAsync({ credits: 120, amountBrl: 29.9 }); } catch { /* expected */ }
    });

    expect(toast.error).toHaveBeenCalledWith(MSG_NETWORK);
  });
});

describe("useCreatePixPayment (Pix inline, Checkout Transparente)", () => {
  const mockInvoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

  const qrPayload = {
    qrCode: "00020126580014br.gov.bcb.pix0136abc",
    qrCodeBase64: "iVBORw0KGgo=",
    purchaseId: "purchase-1",
    ticketUrl: "https://mp.test/ticket/1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as { location?: unknown }).location;
    (window as { location: unknown }).location = { href: "" };
  });

  it("invokes create-pix-payment with the package", async () => {
    mockInvoke.mockResolvedValue({ data: qrPayload, error: null });

    const { result } = renderHook(() => useCreatePixPayment(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ credits: 30, amountBrl: 9.9 });
    });

    expect(mockInvoke).toHaveBeenCalledWith("create-pix-payment", {
      body: { credits: 30, amountBrl: 9.9 },
    });
  });

  it("returns the QR payload for the page to render", async () => {
    mockInvoke.mockResolvedValue({ data: qrPayload, error: null });

    const { result } = renderHook(() => useCreatePixPayment(), { wrapper });
    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync({ credits: 30, amountBrl: 9.9 });
    });

    expect(returned).toEqual(qrPayload);
  });

  // The whole point of Checkout Transparente: the buyer never leaves the app.
  it("never navigates away from the app", async () => {
    mockInvoke.mockResolvedValue({ data: qrPayload, error: null });

    const { result } = renderHook(() => useCreatePixPayment(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ credits: 30, amountBrl: 9.9 });
    });

    expect(window.location.href).toBe("");
  });

  it("calls toast.error when invoke returns error", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockResolvedValue({ data: null, error: new Error("falha no servidor") });

    const { result } = renderHook(() => useCreatePixPayment(), { wrapper });
    await act(async () => {
      try { await result.current.mutateAsync({ credits: 30, amountBrl: 9.9 }); } catch { /* expected */ }
    });

    expect(toast.error).toHaveBeenCalled();
  });

  it("maps a raw network rejection to the friendly connection message", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useCreatePixPayment(), { wrapper });
    await act(async () => {
      try { await result.current.mutateAsync({ credits: 30, amountBrl: 9.9 }); } catch { /* expected */ }
    });

    expect(toast.error).toHaveBeenCalledWith(MSG_NETWORK);
  });
});

describe("pixPollInterval", () => {
  it("keeps polling every 3s while the payment is pending", () => {
    expect(PIX_POLL_INTERVAL_MS).toBe(3000);
    expect(pixPollInterval("pending")).toBe(PIX_POLL_INTERVAL_MS);
  });

  it("keeps polling when the purchase row has not been read yet", () => {
    expect(pixPollInterval(undefined)).toBe(PIX_POLL_INTERVAL_MS);
  });

  it("stops polling once the payment is approved", () => {
    expect(pixPollInterval("approved")).toBe(false);
  });

  it("stops polling once the payment terminally failed", () => {
    expect(pixPollInterval("rejected")).toBe(false);
    expect(pixPollInterval("cancelled")).toBe(false);
  });
});

describe("usePixPurchaseStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  function chainReturning(result: { data: unknown; error: unknown }) {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(result),
    };
  }

  it("reads the status of the pending purchase", async () => {
    const chain = chainReturning({ data: { status: "pending" }, error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => usePixPurchaseStatus("purchase-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.from).toHaveBeenCalledWith("credit_purchases");
    expect(chain.eq).toHaveBeenCalledWith("id", "purchase-1");
    expect(result.current.data).toEqual({ status: "pending" });
  });

  it("reports the approval the webhook wrote", async () => {
    const chain = chainReturning({ data: { status: "approved" }, error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => usePixPurchaseStatus("purchase-1"), { wrapper });
    await waitFor(() => expect(result.current.data?.status).toBe("approved"));
  });

  it("does not query while there is no purchase to watch", () => {
    const { result } = renderHook(() => usePixPurchaseStatus(null), { wrapper });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("propagates a read error as failed query state", async () => {
    const chain = chainReturning({ data: null, error: { message: "boom" } });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => usePixPurchaseStatus("purchase-1"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { message: string }).message).toBe("boom");
  });
});
