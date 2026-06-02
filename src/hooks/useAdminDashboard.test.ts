import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useAdminDashboard, useSetUserStatus, useGrantCredits } from "./useAdminDashboard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MSG_NETWORK } from "@/lib/utils/errors";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockInvoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

const dashboardData = {
  metrics: { total_usd: 1, today_usd: 0, month_usd: 1, daily: [], monthly: [] },
  users: [],
};

beforeEach(() => vi.clearAllMocks());

describe("useAdminDashboard", () => {
  it("returns dashboard data from the admin-dashboard function", async () => {
    mockInvoke.mockResolvedValue({ data: dashboardData, error: null });
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useAdminDashboard(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(dashboardData);
    expect(mockInvoke).toHaveBeenCalledWith("admin-dashboard", { body: {} });
  });

  it("throws a parsed error when the function fails", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error("boom") });
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useAdminDashboard(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("boom");
  });
});

describe("useSetUserStatus", () => {
  it("invokes admin-user-status, invalidates the dashboard and toasts on ban", async () => {
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useSetUserStatus(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ userId: "u1", action: "ban" });
    });

    expect(mockInvoke).toHaveBeenCalledWith("admin-user-status", {
      body: { userId: "u1", action: "ban" },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin", "dashboard"] });
    expect(toast.success).toHaveBeenCalledWith("Usuário inativado.");
  });

  it("toasts a reactivation message on unban", async () => {
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useSetUserStatus(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ userId: "u1", action: "unban" });
    });

    expect(toast.success).toHaveBeenCalledWith("Usuário reativado.");
  });

  it("shows an error toast when the function fails", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error("falhou") });
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useSetUserStatus(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ userId: "u1", action: "ban" });
      } catch {
        /* expected */
      }
    });

    expect(toast.error).toHaveBeenCalledWith("falhou");
  });

  it("maps a raw network rejection to the friendly connection message", async () => {
    mockInvoke.mockRejectedValue(new TypeError("Failed to fetch"));
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useSetUserStatus(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ userId: "u1", action: "ban" });
      } catch {
        /* expected */
      }
    });

    expect(toast.error).toHaveBeenCalledWith(MSG_NETWORK);
  });
});

describe("useGrantCredits", () => {
  it("invokes admin-grant-credits, invalidates the dashboard and toasts the amount", async () => {
    mockInvoke.mockResolvedValue({ data: { success: true, new_balance: 60 }, error: null });
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useGrantCredits(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ userId: "u1", amount: 50 });
    });

    expect(mockInvoke).toHaveBeenCalledWith("admin-grant-credits", {
      body: { userId: "u1", amount: 50 },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin", "dashboard"] });
    expect(toast.success).toHaveBeenCalledWith("50 crédito(s) adicionado(s).");
  });

  it("shows an error toast when the function returns an error", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error("falhou") });
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useGrantCredits(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ userId: "u1", amount: 10 });
      } catch {
        /* expected */
      }
    });

    expect(toast.error).toHaveBeenCalledWith("falhou");
  });

  it("maps a raw network rejection to the friendly connection message", async () => {
    mockInvoke.mockRejectedValue(new TypeError("Failed to fetch"));
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useGrantCredits(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ userId: "u1", amount: 10 });
      } catch {
        /* expected */
      }
    });

    expect(toast.error).toHaveBeenCalledWith(MSG_NETWORK);
  });
});
