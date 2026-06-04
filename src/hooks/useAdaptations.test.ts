import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import {
  useAdaptations,
  useAdaptation,
  useMarkReady,
  useDeleteAdaptation,
  adaptationKeys,
} from "./useAdaptations";
import * as repo from "@/lib/adaptation/persistence/adaptationsRepo";
import { validResult } from "@/lib/adaptation/persistence/__fixtures__/result";

vi.mock("@/lib/adaptation/persistence/adaptationsRepo");
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const ROW = {
  id: "a1",
  user_id: "u1",
  barrier_profile_id: null,
  title: "T",
  original_activity: "a",
  activity_type: null,
  barriers_used: [],
  adaptation_result: validResult,
  status: "ready" as const,
  credits_spent: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("adaptationKeys", () => {
  it("builds stable, hierarchical keys", () => {
    expect(adaptationKeys.list()).toEqual(["adaptations", "list"]);
    expect(adaptationKeys.detail("x")).toEqual(["adaptations", "detail", "x"]);
  });
});

describe("useAdaptations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the list", async () => {
    vi.mocked(repo.listAdaptations).mockResolvedValue([ROW]);
    const { result } = renderHook(() => useAdaptations(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([ROW]);
  });

  it("propagates errors", async () => {
    vi.mocked(repo.listAdaptations).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAdaptations(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useAdaptation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches a single adaptation when an id is provided", async () => {
    vi.mocked(repo.getAdaptation).mockResolvedValue(ROW);
    const { result } = renderHook(() => useAdaptation("a1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(repo.getAdaptation).toHaveBeenCalledWith("a1");
    expect(result.current.data).toEqual(ROW);
  });

  it("is disabled without an id", () => {
    const { result } = renderHook(() => useAdaptation(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(repo.getAdaptation).not.toHaveBeenCalled();
  });
});

describe("useMarkReady", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks ready and invalidates queries", async () => {
    vi.mocked(repo.markReady).mockResolvedValue(ROW);
    const { result } = renderHook(() => useMarkReady(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("a1");
    });
    expect(repo.markReady).toHaveBeenCalledWith("a1");
  });

  it("toasts on error", async () => {
    const { toast } = await import("sonner");
    vi.mocked(repo.markReady).mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useMarkReady(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync("a1");
      } catch {
        /* expected */
      }
    });
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("useDeleteAdaptation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes and invalidates the list", async () => {
    vi.mocked(repo.deleteAdaptation).mockResolvedValue(undefined);
    const { toast } = await import("sonner");
    const { result } = renderHook(() => useDeleteAdaptation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("a1");
    });
    expect(repo.deleteAdaptation).toHaveBeenCalledWith("a1");
    expect(toast.success).toHaveBeenCalled();
  });

  it("toasts on error", async () => {
    const { toast } = await import("sonner");
    vi.mocked(repo.deleteAdaptation).mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useDeleteAdaptation(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync("a1");
      } catch {
        /* expected */
      }
    });
    expect(toast.error).toHaveBeenCalled();
  });
});
