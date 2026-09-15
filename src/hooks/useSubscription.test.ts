import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import {
  usePlans,
  toPlanView,
  useSubscription,
  toSubscriptionView,
  isLiveSubscription,
  useSubscribe,
  useCancelSubscription,
  useUpdateSubscriptionCard,
  useSetInitialPassword,
} from "./useSubscription";
import { supabase } from "@/integrations/supabase/client";

const { mockRefreshProfile } = vi.hoisted(() => ({ mockRefreshProfile: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, refreshProfile: mockRefreshProfile }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(QueryClientProvider, { client: qc }, children);
}

// price_brl arrives as a string on some PostgREST paths although the generated
// type says number; the cast models the runtime shape on purpose.
const PLAN_ROW = {
  id: "pl-pro", slug: "profissional", name: "Profissional", price_brl: "59.90" as unknown as number, monthly_credits: 480,
  highlight: true, admin_only: false, sort_order: 2, active: true, created_at: "", updated_at: "",
};

const SUB_ROW = {
  id: "sub-1", user_id: "u1", plan_id: "pl-pro", status: "authorized", status_detail: null,
  mp_preapproval_id: "pre-1", mp_status: "authorized", payer_email: "a@b.c",
  next_payment_date: "2026-10-12T12:00:00Z", current_period_start: "2026-09-12T12:00:00Z",
  current_period_end: "2026-10-12T12:00:00Z", cancel_requested_at: null, cancelled_at: null,
  card_brand: "master", card_last_four: "1234", first_payment_confirmed: true, attribution: null,
  created_at: "2026-09-12T12:00:00Z", updated_at: "2026-09-12T12:00:00Z", plans: PLAN_ROW,
};

const CARD = { token: "tok", payment_method_id: "visa" };
const mockFrom = supabase.from as ReturnType<typeof vi.fn>;
const mockInvoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});

describe("toPlanView", () => {
  it("normalises the numeric price to a number", () => {
    expect(toPlanView(PLAN_ROW)).toEqual({
      id: "pl-pro", slug: "profissional", name: "Profissional", priceBrl: 59.9, monthlyCredits: 480, highlight: true, adminOnly: false,
    });
  });
});

describe("usePlans", () => {
  it("lists the catalogue ordered by sort_order", async () => {
    const order = vi.fn().mockResolvedValue({ data: [PLAN_ROW], error: null });
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ order }) });

    const { result } = renderHook(() => usePlans(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith("plans");
    expect(order).toHaveBeenCalledWith("sort_order", { ascending: true });
    expect(result.current.data).toEqual([toPlanView(PLAN_ROW)]);
  });

  it("returns an empty list when there is no data and surfaces errors", async () => {
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: null, error: null }) }) });
    const { result } = renderHook(() => usePlans(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);

    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) }) });
    const failed = renderHook(() => usePlans(), { wrapper });
    await waitFor(() => expect(failed.result.current.isError).toBe(true));
  });
});

describe("toSubscriptionView / isLiveSubscription", () => {
  it("shapes the row with its plan and parsed dates", () => {
    const view = toSubscriptionView(SUB_ROW);
    expect(view).toMatchObject({
      id: "sub-1", status: "authorized", cardBrand: "master", cardLastFour: "1234", firstPaymentConfirmed: true,
      plan: expect.objectContaining({ slug: "profissional" }),
    });
    expect(view.nextPaymentDate?.toISOString()).toBe("2026-10-12T12:00:00.000Z");
    expect(view.currentPeriodEnd?.toISOString()).toBe("2026-10-12T12:00:00.000Z");
    expect(view.cancelledAt).toBeNull();
    expect(view.createdAt?.toISOString()).toBe("2026-09-12T12:00:00.000Z");
  });

  it("tolerates a missing plan and unparseable dates", () => {
    const view = toSubscriptionView({ ...SUB_ROW, plans: null, next_payment_date: "garbage", current_period_end: null });
    expect(view.plan).toBeNull();
    expect(view.nextPaymentDate).toBeNull();
    expect(view.currentPeriodEnd).toBeNull();
  });

  it("treats authorized, past_due and paused as live", () => {
    expect(isLiveSubscription(toSubscriptionView(SUB_ROW))).toBe(true);
    expect(isLiveSubscription(toSubscriptionView({ ...SUB_ROW, status: "past_due" }))).toBe(true);
    expect(isLiveSubscription(toSubscriptionView({ ...SUB_ROW, status: "paused" }))).toBe(true);
    expect(isLiveSubscription(toSubscriptionView({ ...SUB_ROW, status: "cancelled" }))).toBe(false);
    expect(isLiveSubscription(toSubscriptionView({ ...SUB_ROW, status: "rejected" }))).toBe(false);
    expect(isLiveSubscription(null)).toBe(false);
    expect(isLiveSubscription(undefined)).toBe(false);
  });
});

describe("useSubscription", () => {
  function chain(result: { data: unknown; error: unknown }) {
    const maybeSingle = vi.fn().mockResolvedValue(result);
    const limit = vi.fn().mockReturnValue({ maybeSingle });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });
    return { select, eq, order, limit };
  }

  it("loads the owner's most recent subscription with its plan", async () => {
    const c = chain({ data: SUB_ROW, error: null });
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith("subscriptions");
    expect(c.select).toHaveBeenCalledWith("*, plans(*)");
    expect(c.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(c.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(c.limit).toHaveBeenCalledWith(1);
    expect(result.current.data).toEqual(toSubscriptionView(SUB_ROW));
  });

  it("resolves to null when the user never subscribed and surfaces errors", async () => {
    chain({ data: null, error: null });
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();

    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    chain({ data: null, error: { message: "boom" } });
    const failed = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(failed.result.current.isError).toBe(true));
  });
});

describe("useSubscribe", () => {
  it("invokes subscribe with the plan and card, then refreshes profile and queries", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockResolvedValue({ data: { status: "authorized", subscriptionId: "sub-1" }, error: null });
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useSubscribe(), { wrapper });
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync({ planSlug: "profissional", card: CARD, cardLastFour: "1234" });
    });

    expect(mockInvoke).toHaveBeenCalledWith("subscribe", { body: { planSlug: "profissional", card: CARD, cardLastFour: "1234" } });
    expect(out).toEqual({ status: "authorized", subscriptionId: "sub-1" });
    expect(mockRefreshProfile).toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["subscription"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["credit_transactions"] });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("returns a rejected card as data, not as an error", async () => {
    mockInvoke.mockResolvedValue({ data: { status: "rejected", subscriptionId: "sub-1", message: "Recusado" }, error: null });
    const { result } = renderHook(() => useSubscribe(), { wrapper });
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync({ planSlug: "profissional", card: CARD });
    });
    expect(out).toMatchObject({ status: "rejected", message: "Recusado" });
  });

  it("toasts the server message on a business refusal", async () => {
    const { toast } = await import("sonner");
    const error = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: new Response(JSON.stringify({ error: "Você já tem uma assinatura ativa." }), { status: 409 }),
    });
    mockInvoke.mockResolvedValue({ data: null, error });
    const { result } = renderHook(() => useSubscribe(), { wrapper });
    await act(async () => {
      try { await result.current.mutateAsync({ planSlug: "profissional", card: CARD }); } catch { /* expected */ }
    });
    expect(toast.error).toHaveBeenCalledWith("Você já tem uma assinatura ativa.");
    expect(mockRefreshProfile).not.toHaveBeenCalled();
  });
});

describe("useSubscribe (anonymous funnel)", () => {
  it("forwards the account block and returns accountCreated untouched", async () => {
    mockInvoke.mockResolvedValue({ data: { status: "authorized", subscriptionId: "sub-1", accountCreated: true }, error: null });
    const { result } = renderHook(() => useSubscribe(), { wrapper });
    const account = { fullName: "Ana", email: "a@b.c", termsVersion: "2026-09" };
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync({ planSlug: "basico", card: CARD, account });
    });
    expect(mockInvoke).toHaveBeenCalledWith("subscribe", { body: { planSlug: "basico", card: CARD, account } });
    expect(out).toMatchObject({ accountCreated: true });
  });
});

describe("useSetInitialPassword", () => {
  it("invokes set-initial-password and refreshes the profile", async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    const { result } = renderHook(() => useSetInitialPassword(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ password: "secret1" });
    });
    expect(mockInvoke).toHaveBeenCalledWith("set-initial-password", { body: { password: "secret1" } });
    expect(mockRefreshProfile).toHaveBeenCalled();
  });

  it("warns when the password was saved but the flag did not clear", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockResolvedValue({ data: { ok: true, flagCleared: false }, error: null });
    const { result } = renderHook(() => useSetInitialPassword(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ password: "secret1" });
    });
    expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/Senha salva/));
    expect(mockRefreshProfile).toHaveBeenCalled();
  });

  it("toasts on failure and leaves the profile alone", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockResolvedValue({ data: null, error: new Error("falha") });
    const { result } = renderHook(() => useSetInitialPassword(), { wrapper });
    await act(async () => {
      try { await result.current.mutateAsync({ password: "secret1" }); } catch { /* expected */ }
    });
    expect(toast.error).toHaveBeenCalled();
    expect(mockRefreshProfile).not.toHaveBeenCalled();
  });
});

describe("useCancelSubscription", () => {
  it("invokes cancel-subscription, refreshes and confirms", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockResolvedValue({ data: { status: "cancelled", subscriptionId: "sub-1" }, error: null });
    const { result } = renderHook(() => useCancelSubscription(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(mockInvoke).toHaveBeenCalledWith("cancel-subscription", { body: {} });
    expect(mockRefreshProfile).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/cancelada/i));
  });

  it("toasts the error when the provider refuses", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockResolvedValue({ data: null, error: new Error("falha") });
    const { result } = renderHook(() => useCancelSubscription(), { wrapper });
    await act(async () => {
      try { await result.current.mutateAsync(); } catch { /* expected */ }
    });
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("useUpdateSubscriptionCard", () => {
  it("sends the new card and confirms", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockResolvedValue({ data: { status: "updated", subscriptionId: "sub-1" }, error: null });
    const { result } = renderHook(() => useUpdateSubscriptionCard(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ card: CARD, cardLastFour: "9999" });
    });
    expect(mockInvoke).toHaveBeenCalledWith("update-subscription-card", { body: { card: CARD, cardLastFour: "9999" } });
    expect(mockRefreshProfile).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Cartão atualizado/));
  });

  it("toasts when the card is refused, unless the caller shows it inline", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockResolvedValue({ data: null, error: new Error("falha") });
    const { result } = renderHook(() => useUpdateSubscriptionCard(), { wrapper });
    await act(async () => {
      try { await result.current.mutateAsync({ card: CARD }); } catch { /* expected */ }
    });
    expect(toast.error).toHaveBeenCalledTimes(1);

    const silent = renderHook(() => useUpdateSubscriptionCard({ toastErrors: false }), { wrapper });
    await act(async () => {
      try { await silent.result.current.mutateAsync({ card: CARD }); } catch { /* expected */ }
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
