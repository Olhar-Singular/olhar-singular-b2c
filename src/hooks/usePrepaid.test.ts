import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import {
  PIX_PLAN_POLL_INTERVAL_MS,
  pixPlanPollInterval,
  useActivePrepaid,
  useCreatePixPlan,
  usePixPlanStatus,
  usePrepaidPlans,
} from "./usePrepaid";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

const auth = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;
const from = supabase.from as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: "u1" };
});

describe("usePrepaidPlans", () => {
  it("reads the catalogue in order and converts the rows", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ id: "a", slug: "pix-3-meses", months: 3, credits: 900, price_brl: "89.90", highlight: true, admin_only: false }],
      error: null,
    });
    const select = vi.fn(() => ({ order }));
    from.mockReturnValue({ select });
    const { result } = renderHook(() => usePrepaidPlans(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(from).toHaveBeenCalledWith("prepaid_plans");
    expect(order).toHaveBeenCalledWith("sort_order", { ascending: true });
    expect(result.current.data).toEqual([{ id: "a", slug: "pix-3-meses", months: 3, credits: 900, priceBrl: 89.9, highlight: true, adminOnly: false }]);
  });

  it("surfaces a read error and copes with no rows", async () => {
    from.mockReturnValue({ select: () => ({ order: vi.fn().mockResolvedValue({ data: null, error: new Error("rls") }) }) });
    const failed = renderHook(() => usePrepaidPlans(), { wrapper });
    await waitFor(() => expect(failed.result.current.isError).toBe(true));

    from.mockReturnValue({ select: () => ({ order: vi.fn().mockResolvedValue({ data: null, error: null }) }) });
    const empty = renderHook(() => usePrepaidPlans(), { wrapper });
    await waitFor(() => expect(empty.result.current.data).toEqual([]));
  });
});

describe("useCreatePixPlan", () => {
  const QR = { purchaseId: "p1", qrCode: "000201", qrCodeBase64: "iVBOR", expiresAt: "2026-11-15T16:00:00.000Z", amountBrl: 89.9, credits: 900, months: 3 };

  it("asks pix-plan-checkout for the QR of the chosen plan", async () => {
    invoke.mockResolvedValue({ data: QR, error: null });
    const { result } = renderHook(() => useCreatePixPlan(), { wrapper });
    const account = { fullName: "Ana", email: "ana@x.com", termsVersion: "2026-11.1" };
    let answer: unknown;
    await act(async () => { answer = await result.current.mutateAsync({ planSlug: "pix-3-meses", account }); });
    expect(invoke).toHaveBeenCalledWith("pix-plan-checkout", { body: { planSlug: "pix-3-meses", account } });
    expect(answer).toEqual(QR);
  });

  it("throws the server message with its code", async () => {
    const response = new Response(JSON.stringify({ error: "Este e-mail já tem conta. Entre para pagar.", code: "email_exists" }), { status: 409 });
    const { FunctionsHttpError } = await import("@supabase/supabase-js");
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) });
    const { result } = renderHook(() => useCreatePixPlan(), { wrapper });
    let caught: (Error & { code?: string }) | null = null;
    await act(async () => {
      try { await result.current.mutateAsync({ planSlug: "pix-3-meses" }); } catch (e) { caught = e as Error & { code?: string }; }
    });
    expect(caught!.message).toBe("Este e-mail já tem conta. Entre para pagar.");
    expect(caught!.code).toBe("email_exists");
  });
});

describe("pixPlanPollInterval", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 1).toISOString();

  it("polls while pending and before the QR expires", () => {
    expect(pixPlanPollInterval(undefined, future)).toBe(PIX_PLAN_POLL_INTERVAL_MS);
    expect(pixPlanPollInterval("pending", future)).toBe(PIX_PLAN_POLL_INTERVAL_MS);
  });

  it("stops on a final state or after the expiry", () => {
    expect(pixPlanPollInterval("approved", future)).toBe(false);
    expect(pixPlanPollInterval("failed", future)).toBe(false);
    expect(pixPlanPollInterval("pending", past)).toBe(false);
  });
});

describe("usePixPlanStatus", () => {
  it("is idle without a purchase", () => {
    const { result } = renderHook(() => usePixPlanStatus(null, null), { wrapper });
    expect(result.current).toBe("idle");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reports what pix-plan-status answers", async () => {
    invoke.mockResolvedValue({ data: { status: "approved" }, error: null });
    const future = new Date(Date.now() + 60_000).toISOString();
    const { result } = renderHook(() => usePixPlanStatus("p1", future), { wrapper });
    expect(result.current).toBe("pending");
    await waitFor(() => expect(result.current).toBe("approved"));
    expect(invoke).toHaveBeenCalledWith("pix-plan-status", { body: { purchaseId: "p1" } });
  });

  it("turns a still-pending QR past its expiry into expired", async () => {
    invoke.mockResolvedValue({ data: { status: "pending" }, error: null });
    const past = new Date(Date.now() - 1000).toISOString();
    const { result } = renderHook(() => usePixPlanStatus("p1", past), { wrapper });
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(result.current).toBe("expired");
  });

  it("a failed read keeps it pending (the next poll retries)", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("network") });
    const future = new Date(Date.now() + 60_000).toISOString();
    const { result } = renderHook(() => usePixPlanStatus("p1", future), { wrapper });
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(result.current).toBe("pending");
  });
});

describe("useActivePrepaid", () => {
  function chain(result: { data: unknown; error: unknown }) {
    const c = {
      select: vi.fn(() => c),
      eq: vi.fn(() => c),
      gt: vi.fn(() => Promise.resolve(result)),
    };
    return c;
  }

  it("aggregates the user's approved plan purchases still running", async () => {
    const c = chain({
      data: [{ plan_period_end: "2099-02-15T15:00:00+00:00", plan_locked_credits: 600, plan_unlock_at: "2099-01-01T00:00:00Z", plan_released_at: null }],
      error: null,
    });
    from.mockReturnValue(c);
    const { result } = renderHook(() => useActivePrepaid(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(from).toHaveBeenCalledWith("credit_purchases");
    expect(c.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(c.eq).toHaveBeenCalledWith("kind", "plan");
    expect(c.eq).toHaveBeenCalledWith("status", "approved");
    expect(c.gt).toHaveBeenCalledWith("plan_period_end", expect.any(String));
    expect(result.current.data).toMatchObject({ lockedCredits: 600 });
  });

  it("is null with no rows and surfaces read errors", async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    const none = renderHook(() => useActivePrepaid(), { wrapper });
    await waitFor(() => expect(none.result.current.isSuccess).toBe(true));
    expect(none.result.current.data).toBeNull();

    from.mockReturnValue(chain({ data: null, error: new Error("rls") }));
    const failed = renderHook(() => useActivePrepaid(), { wrapper });
    await waitFor(() => expect(failed.result.current.isError).toBe(true));
  });

  it("does not query without a user", () => {
    auth.user = null;
    renderHook(() => useActivePrepaid(), { wrapper });
    expect(from).not.toHaveBeenCalled();
  });
});
