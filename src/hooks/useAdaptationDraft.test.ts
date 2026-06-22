import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAdaptationDraft } from "./useAdaptationDraft";
import { validResult } from "@/lib/adaptation/persistence/__fixtures__/result";
import * as repo from "@/lib/adaptation/persistence/adaptationsRepo";
import * as mirror from "@/lib/adaptation/persistence/draftMirror";
import type { AdaptationResult } from "@/lib/adaptation/canonical/schema";

vi.mock("@/lib/adaptation/persistence/adaptationsRepo");
vi.mock("@/lib/adaptation/persistence/draftMirror");
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const ROW = {
  id: "d1",
  user_id: "u1",
  barrier_profile_id: null,
  title: "T",
  original_activity: "a",
  activity_type: null,
  barriers_used: [],
  adaptation_result: validResult,
  status: "draft" as const,
  credits_spent: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

function edited(tag: string): AdaptationResult {
  return { ...validResult, pedagogical_justification: tag };
}

describe("useAdaptationDraft", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(mirror.writeMirror).mockResolvedValue(undefined);
    vi.mocked(mirror.clearMirror).mockResolvedValue(undefined);
    vi.mocked(mirror.readMirror).mockResolvedValue(null);
    vi.mocked(repo.updateAdaptation).mockResolvedValue({ ok: true, row: ROW });
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("starts idle and does nothing without a draftId", () => {
    const { result } = renderHook(() =>
      useAdaptationDraft({ draftId: null, result: validResult, initialUpdatedAt: null }),
    );
    expect(result.current.status).toBe("idle");
    expect(repo.updateAdaptation).not.toHaveBeenCalled();
  });

  it("CREATE flow: autosave runs once the draft id + updated_at arrive via props", async () => {
    // Mount with no draft yet (the wizard's create flow), then the draft gets
    // created and its id/updated_at propagate as props. Autosave must engage.
    const { rerender } = renderHook((p) => useAdaptationDraft(p), {
      initialProps: {
        draftId: null as string | null,
        result: validResult,
        initialUpdatedAt: null as string | null,
        debounceMs: 1200,
      },
    });
    // Draft just got created: id + updated_at become set, and the result changes.
    rerender({
      draftId: "d1",
      result: edited("created"),
      initialUpdatedAt: "2026-06-04T00:00:00Z",
      debounceMs: 1200,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(repo.updateAdaptation).toHaveBeenCalledWith(
      "d1",
      { adaptation_result: edited("created") },
      "2026-06-04T00:00:00Z",
    );
  });

  it("debounces and saves an edit after the window elapses", async () => {
    const { rerender, result } = renderHook(
      (props) => useAdaptationDraft(props),
      {
        initialProps: {
          draftId: "d1",
          result: validResult,
          initialUpdatedAt: "2026-01-01T00:00:00Z",
          debounceMs: 1200,
        },
      },
    );
    // Change the result → schedules a debounced save.
    rerender({
      draftId: "d1",
      result: edited("v2"),
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 1200,
    });
    expect(repo.updateAdaptation).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(mirror.writeMirror).toHaveBeenCalledWith("d1", edited("v2"));
    expect(repo.updateAdaptation).toHaveBeenCalledWith(
      "d1",
      { adaptation_result: edited("v2") },
      "2026-01-01T00:00:00Z",
    );
    expect(mirror.clearMirror).toHaveBeenCalledWith("d1");
    expect(result.current.status).toBe("saved");
  });

  it("advances expectedUpdatedAt so consecutive saves use the fresh value", async () => {
    const props = {
      draftId: "d1",
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 1000,
    };
    const { rerender } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });

    rerender({ ...props, result: edited("a") });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    rerender({ ...props, result: edited("b") });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(repo.updateAdaptation).toHaveBeenNthCalledWith(
      2,
      "d1",
      { adaptation_result: edited("b") },
      ROW.updated_at, // advanced from the first save's returned row
    );
  });

  it("sets conflict status and calls onConflict when the repo reports a conflict", async () => {
    vi.mocked(repo.updateAdaptation).mockResolvedValue({ ok: false, conflict: true });
    const onConflict = vi.fn();
    const props = {
      draftId: "d1",
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 500,
      onConflict,
    };
    const { rerender, result } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });
    rerender({ ...props, result: edited("x") });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(result.current.status).toBe("conflict");
    expect(onConflict).toHaveBeenCalled();
  });

  it("sets error status and toasts once when the repo throws", async () => {
    const { toast } = await import("sonner");
    vi.mocked(repo.updateAdaptation).mockRejectedValue(new Error("net"));
    const props = {
      draftId: "d1",
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 500,
    };
    const { rerender, result } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });
    rerender({ ...props, result: edited("y") });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(result.current.status).toBe("error");
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/guardadas localmente/i),
    );
  });

  it("does not re-toast on a consecutive failed retry (one toast per error transition)", async () => {
    const { toast } = await import("sonner");
    vi.mocked(repo.updateAdaptation).mockRejectedValue(new Error("net"));
    const props = {
      draftId: "d1",
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 500,
    };
    const { rerender } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });
    rerender({ ...props, result: edited("a") });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    // A second failing edit while already in error → no new toast.
    rerender({ ...props, result: edited("b") });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("re-toasts after recovering then failing again (new error transition)", async () => {
    const { toast } = await import("sonner");
    vi.mocked(repo.updateAdaptation).mockRejectedValueOnce(new Error("net"));
    const props = {
      draftId: "d1",
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 500,
    };
    const { rerender } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });
    rerender({ ...props, result: edited("fail") });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(toast.error).toHaveBeenCalledTimes(1);
    // Next save succeeds (default mock) → status leaves error.
    rerender({ ...props, result: edited("ok") });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    // Now fail again → a fresh transition into error toasts again.
    vi.mocked(repo.updateAdaptation).mockRejectedValueOnce(new Error("net2"));
    rerender({ ...props, result: edited("fail2") });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(toast.error).toHaveBeenCalledTimes(2);
  });

  it("flush() saves immediately without waiting for the debounce", async () => {
    const props = {
      draftId: "d1",
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 5000,
    };
    const { rerender, result } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });
    rerender({ ...props, result: edited("z") });
    await act(async () => {
      await result.current.flush();
    });
    expect(repo.updateAdaptation).toHaveBeenCalledOnce();
  });

  it("does not save when the result is unchanged (not dirty)", async () => {
    const props = {
      draftId: "d1",
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 100,
    };
    const { result } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });
    await act(async () => {
      await result.current.flush();
    });
    expect(repo.updateAdaptation).not.toHaveBeenCalled();
  });

  it("flushes on window blur", async () => {
    const props = {
      draftId: "d1",
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 5000,
    };
    const { rerender } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });
    rerender({ ...props, result: edited("blur") });
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      await Promise.resolve();
    });
    expect(repo.updateAdaptation).toHaveBeenCalled();
  });

  it("flushes when the tab becomes hidden", async () => {
    const props = {
      draftId: "d1",
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 5000,
    };
    const { rerender } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });
    rerender({ ...props, result: edited("hidden") });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(repo.updateAdaptation).toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("does NOT flush when visibility changes to visible", async () => {
    const props = {
      draftId: "d1",
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 5000,
    };
    const { rerender } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });
    rerender({ ...props, result: edited("vis") });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(repo.updateAdaptation).not.toHaveBeenCalled();
  });

  it("flushes on unmount", async () => {
    const props = {
      draftId: "d1",
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 5000,
    };
    const { rerender, unmount } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });
    rerender({ ...props, result: edited("unmount") });
    await act(async () => {
      unmount();
      await Promise.resolve();
    });
    expect(repo.updateAdaptation).toHaveBeenCalled();
  });

  it("restoreFromMirror returns the mirrored result", async () => {
    vi.mocked(mirror.readMirror).mockResolvedValue({
      draftId: "d1",
      result: edited("mirrored"),
      savedAt: 1,
    });
    const { result } = renderHook(() =>
      useAdaptationDraft({ draftId: "d1", result: validResult, initialUpdatedAt: "t" }),
    );
    let restored: AdaptationResult | null = null;
    await act(async () => {
      restored = await result.current.restoreFromMirror();
    });
    expect(restored).toEqual(edited("mirrored"));
  });

  it("restoreFromMirror returns null without a draftId", async () => {
    const { result } = renderHook(() =>
      useAdaptationDraft({ draftId: null, result: null, initialUpdatedAt: null }),
    );
    let restored: AdaptationResult | null = edited("x");
    await act(async () => {
      restored = await result.current.restoreFromMirror();
    });
    expect(restored).toBeNull();
  });

  it("restoreFromMirror returns null when the mirror is empty", async () => {
    vi.mocked(mirror.readMirror).mockResolvedValue(null);
    const { result } = renderHook(() =>
      useAdaptationDraft({ draftId: "d1", result: validResult, initialUpdatedAt: "t" }),
    );
    let restored: AdaptationResult | null = edited("x");
    await act(async () => {
      restored = await result.current.restoreFromMirror();
    });
    expect(restored).toBeNull();
  });
});
