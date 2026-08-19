import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import {
  useAdaptations,
  useAdaptation,
  useMarkReady,
  useDuplicateAdaptation,
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

  // --- B13: the editor is the writer; refetching under it is destructive -----

  it("does NOT refetch the open adaptation on window focus", async () => {
    // The wizard flushes its autosave on blur, so every alt-tab back fired a
    // refetch of the row it had just written — and the fresher updated_at that
    // came back remounted the editor mid-edit. The wizard is the writer here;
    // re-reading the row under it can only destroy work.
    vi.mocked(repo.getAdaptation).mockResolvedValue(ROW);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const localWrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useAdaptation("a1"), { wrapper: localWrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const query = qc.getQueryCache().find({ queryKey: adaptationKeys.detail("a1") });
    expect(query?.options.refetchOnWindowFocus).toBe(false);
    expect(query?.options.refetchOnMount).toBe(false);
  });
});

describe("useMarkReady", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks ready with the optimistic token and invalidates queries on success", async () => {
    vi.mocked(repo.markReady).mockResolvedValue({ ok: true, updatedAt: "2026-01-02T00:00:00Z" });
    const { result } = renderHook(() => useMarkReady(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "a1", expectedUpdatedAt: "2026-01-01T00:00:00Z" });
    });
    // No subject passed → no `subject` key in the patch at all, so filing is
    // left untouched. Sending `{ subject: undefined }` would be a different
    // thing entirely: supabase-js serialises it and would blank the column.
    expect(repo.markReady).toHaveBeenCalledWith("a1", "2026-01-01T00:00:00Z", {});
  });

  it("files the adaptation under a subject when one is given", async () => {
    vi.mocked(repo.markReady).mockResolvedValue({ ok: true, updatedAt: "2026-01-02T00:00:00Z" });
    const { result } = renderHook(() => useMarkReady(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        id: "a1",
        expectedUpdatedAt: "2026-01-01T00:00:00Z",
        subject: "Geografia",
      });
    });
    expect(repo.markReady).toHaveBeenCalledWith("a1", "2026-01-01T00:00:00Z", {
      subject: "Geografia",
    });
  });

  it("files the adaptation into a folder in the same write as the status flip", async () => {
    // A second UPDATE for the folder would bump updated_at again and leave the
    // caller's optimistic token one version behind — the exact mechanism that
    // has cost user work in this codebase before.
    vi.mocked(repo.markReady).mockResolvedValue({ ok: true, updatedAt: "2026-01-02T00:00:00Z" });
    const { result } = renderHook(() => useMarkReady(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        id: "a1",
        expectedUpdatedAt: "2026-01-01T00:00:00Z",
        subject: "Física",
        folderId: "f1",
      });
    });
    expect(repo.markReady).toHaveBeenCalledWith("a1", "2026-01-01T00:00:00Z", {
      subject: "Física",
      folder_id: "f1",
    });
  });

  it("takes the adaptation out of every folder with an explicit null", async () => {
    vi.mocked(repo.markReady).mockResolvedValue({ ok: true, updatedAt: "2026-01-02T00:00:00Z" });
    const { result } = renderHook(() => useMarkReady(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        id: "a1",
        expectedUpdatedAt: "2026-01-01T00:00:00Z",
        folderId: null,
      });
    });
    expect(repo.markReady).toHaveBeenCalledWith("a1", "2026-01-01T00:00:00Z", { folder_id: null });
  });

  it("clears the subject when the teacher unfiles it", async () => {
    vi.mocked(repo.markReady).mockResolvedValue({ ok: true, updatedAt: "2026-01-02T00:00:00Z" });
    const { result } = renderHook(() => useMarkReady(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        id: "a1",
        expectedUpdatedAt: "2026-01-01T00:00:00Z",
        subject: null,
      });
    });
    expect(repo.markReady).toHaveBeenCalledWith("a1", "2026-01-01T00:00:00Z", { subject: null });
  });

  it("does not invalidate when the mark-ready conflicts", async () => {
    vi.mocked(repo.markReady).mockResolvedValue({ ok: false, conflict: true });
    const { result } = renderHook(() => useMarkReady(), { wrapper });
    let res: Awaited<ReturnType<typeof repo.markReady>> | undefined;
    await act(async () => {
      res = await result.current.mutateAsync({ id: "a1", expectedUpdatedAt: "stale" });
    });
    expect(res).toEqual({ ok: false, conflict: true });
  });

  it("toasts on error", async () => {
    const { toast } = await import("sonner");
    vi.mocked(repo.markReady).mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useMarkReady(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ id: "a1", expectedUpdatedAt: "t" });
      } catch {
        /* expected */
      }
    });
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("useDuplicateAdaptation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("copies the adaptation and refreshes the library", async () => {
    vi.mocked(repo.duplicateAdaptation).mockResolvedValue({ ...ROW, id: "a2" } as never);
    const { toast } = await import("sonner");
    const { result } = renderHook(() => useDuplicateAdaptation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "a1", title: "T (cópia)" });
    });
    expect(repo.duplicateAdaptation).toHaveBeenCalledWith("a1", "T (cópia)");
    expect(toast.success).toHaveBeenCalled();
  });

  it("surfaces a failure instead of silently doing nothing", async () => {
    vi.mocked(repo.duplicateAdaptation).mockRejectedValue(new Error("nope"));
    const { toast } = await import("sonner");
    const { result } = renderHook(() => useDuplicateAdaptation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "a1", title: "x" }).catch(() => undefined);
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
