import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import {
  useTransactionHistory,
  usePackages,
  toPackageView,
  useCreatePixPayment,
  useCreateCardPayment,
  usePurchaseStatus,
  purchasePollInterval,
  PURCHASE_POLL_INTERVAL_MS,
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

const CARD = { token: "tok", payment_method_id: "visa", payer: { email: "a@b.c" } };

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

describe("usePackages", () => {
  beforeEach(() => vi.clearAllMocks());

  const rows = [
    { id: "p1", credits: 30, price_brl: 9.9, label: "Básico", highlight: false, admin_only: false, sort_order: 1 },
    { id: "p2", credits: 120, price_brl: "29.90", label: "Profissional", highlight: true, admin_only: false, sort_order: 2 },
  ];

  it("reads the catalogue ordered by sort_order and normalizes the price", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => usePackages(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.from).toHaveBeenCalledWith("credit_packages");
    expect(chain.order).toHaveBeenCalledWith("sort_order", { ascending: true });
    expect(result.current.data).toEqual([
      { id: "p1", credits: 30, amountBrl: 9.9, label: "Básico", highlight: false, adminOnly: false },
      { id: "p2", credits: 120, amountBrl: 29.9, label: "Profissional", highlight: true, adminOnly: false },
    ]);
  });

  it("returns an empty list when the catalogue is empty", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => usePackages(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("propagates a read error", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => usePackages(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("toPackageView maps a row", () => {
    expect(toPackageView(rows[1] as never)).toEqual({
      id: "p2",
      credits: 120,
      amountBrl: 29.9,
      label: "Profissional",
      highlight: true,
      adminOnly: false,
    });
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

  it("invokes create-pix-payment with the package id", async () => {
    mockInvoke.mockResolvedValue({ data: qrPayload, error: null });

    const { result } = renderHook(() => useCreatePixPayment(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ packageId: "p1" });
    });

    expect(mockInvoke).toHaveBeenCalledWith("create-pix-payment", {
      body: { packageId: "p1" },
    });
  });

  it("returns the QR payload for the page to render", async () => {
    mockInvoke.mockResolvedValue({ data: qrPayload, error: null });

    const { result } = renderHook(() => useCreatePixPayment(), { wrapper });
    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync({ packageId: "p1" });
    });

    expect(returned).toEqual(qrPayload);
  });

  // The whole point of Checkout Transparente: the buyer never leaves the app.
  it("never navigates away from the app", async () => {
    mockInvoke.mockResolvedValue({ data: qrPayload, error: null });

    const { result } = renderHook(() => useCreatePixPayment(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ packageId: "p1" });
    });

    expect(window.location.href).toBe("");
  });

  it("calls toast.error when invoke returns error", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockResolvedValue({ data: null, error: new Error("falha no servidor") });

    const { result } = renderHook(() => useCreatePixPayment(), { wrapper });
    await act(async () => {
      try { await result.current.mutateAsync({ packageId: "p1" }); } catch { /* expected */ }
    });

    expect(toast.error).toHaveBeenCalled();
  });

  it("maps a raw network rejection to the friendly connection message", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useCreatePixPayment(), { wrapper });
    await act(async () => {
      try { await result.current.mutateAsync({ packageId: "p1" }); } catch { /* expected */ }
    });

    expect(toast.error).toHaveBeenCalledWith(MSG_NETWORK);
  });
});

describe("useCreateCardPayment (card inline via Mercado Pago)", () => {
  const mockInvoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as { location?: unknown }).location;
    (window as { location: unknown }).location = { href: "" };
  });

  it("invokes create-card-payment with the package id and the Brick formData", async () => {
    mockInvoke.mockResolvedValue({
      data: { status: "approved", purchaseId: "purchase-1", creditsGranted: 30 },
      error: null,
    });

    const { result } = renderHook(() => useCreateCardPayment(), { wrapper });
    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync({ packageId: "p1", card: CARD });
    });

    expect(mockInvoke).toHaveBeenCalledWith("create-card-payment", {
      body: { packageId: "p1", card: CARD },
    });
    expect(returned).toEqual({ status: "approved", purchaseId: "purchase-1", creditsGranted: 30 });
    expect(window.location.href).toBe("");
  });

  // A declined card is a result the dialog renders, not a mutation error.
  it("resolves with the rejection instead of throwing", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockResolvedValue({
      data: {
        status: "rejected",
        purchaseId: "purchase-1",
        statusDetail: "cc_rejected_insufficient_amount",
        message: "O cartão não tem limite.",
      },
      error: null,
    });

    const { result } = renderHook(() => useCreateCardPayment(), { wrapper });
    let returned: { status: string } | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({ packageId: "p1", card: CARD });
    });

    expect(returned?.status).toBe("rejected");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("calls toast.error when invoke returns error", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockResolvedValue({ data: null, error: new Error("falha no servidor") });

    const { result } = renderHook(() => useCreateCardPayment(), { wrapper });
    await act(async () => {
      try { await result.current.mutateAsync({ packageId: "p1", card: CARD }); } catch { /* expected */ }
    });

    expect(toast.error).toHaveBeenCalled();
  });

  it("maps a raw network rejection to the friendly connection message", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useCreateCardPayment(), { wrapper });
    await act(async () => {
      try { await result.current.mutateAsync({ packageId: "p1", card: CARD }); } catch { /* expected */ }
    });

    expect(toast.error).toHaveBeenCalledWith(MSG_NETWORK);
  });
});

describe("purchasePollInterval", () => {
  it("keeps polling every 3s while the payment is pending", () => {
    expect(PURCHASE_POLL_INTERVAL_MS).toBe(3000);
    expect(purchasePollInterval("pending")).toBe(PURCHASE_POLL_INTERVAL_MS);
  });

  it("keeps polling when the purchase row has not been read yet", () => {
    expect(purchasePollInterval(undefined)).toBe(PURCHASE_POLL_INTERVAL_MS);
  });

  it("stops polling once the payment is approved", () => {
    expect(purchasePollInterval("approved")).toBe(false);
  });

  it("stops polling once the payment terminally failed", () => {
    expect(purchasePollInterval("rejected")).toBe(false);
    expect(purchasePollInterval("cancelled")).toBe(false);
  });
});

describe("usePurchaseStatus", () => {
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

    const { result } = renderHook(() => usePurchaseStatus("purchase-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.from).toHaveBeenCalledWith("credit_purchases");
    expect(chain.eq).toHaveBeenCalledWith("id", "purchase-1");
    expect(result.current.data).toEqual({ status: "pending" });
  });

  it("reports the approval the webhook wrote", async () => {
    const chain = chainReturning({ data: { status: "approved" }, error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => usePurchaseStatus("purchase-1"), { wrapper });
    await waitFor(() => expect(result.current.data?.status).toBe("approved"));
  });

  it("does not query while there is no purchase to watch", () => {
    const { result } = renderHook(() => usePurchaseStatus(null), { wrapper });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("propagates a read error as failed query state", async () => {
    const chain = chainReturning({ data: null, error: { message: "boom" } });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { result } = renderHook(() => usePurchaseStatus("purchase-1"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { message: string }).message).toBe("boom");
  });
});
