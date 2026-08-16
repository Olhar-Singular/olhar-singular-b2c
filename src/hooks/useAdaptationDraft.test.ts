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

  it("syncs the title column when the result carries a manual header title", async () => {
    const withTitle: AdaptationResult = { ...validResult, header: { title: "Prova de Frações" } };
    const { rerender } = renderHook((props) => useAdaptationDraft(props), {
      initialProps: {
        draftId: "d1",
        result: validResult,
        initialUpdatedAt: "2026-01-01T00:00:00Z",
        debounceMs: 1200,
      },
    });
    rerender({
      draftId: "d1",
      result: withTitle,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 1200,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(repo.updateAdaptation).toHaveBeenCalledWith(
      "d1",
      { adaptation_result: withTitle, title: "Prova de Frações" },
      "2026-01-01T00:00:00Z",
    );
  });

  it("does not touch the title column when the header has no title", async () => {
    const withSchool: AdaptationResult = { ...validResult, header: { school: "Escola Singular" } };
    const { rerender } = renderHook((props) => useAdaptationDraft(props), {
      initialProps: {
        draftId: "d1",
        result: validResult,
        initialUpdatedAt: "2026-01-01T00:00:00Z",
        debounceMs: 1200,
      },
    });
    rerender({
      draftId: "d1",
      result: withSchool,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 1200,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(repo.updateAdaptation).toHaveBeenCalledWith(
      "d1",
      { adaptation_result: withSchool },
      "2026-01-01T00:00:00Z",
    );
  });

  it("does not touch the title column when the header title is blank", async () => {
    const withBlank: AdaptationResult = { ...validResult, header: { title: "   " } };
    const { rerender } = renderHook((props) => useAdaptationDraft(props), {
      initialProps: {
        draftId: "d1",
        result: validResult,
        initialUpdatedAt: "2026-01-01T00:00:00Z",
        debounceMs: 1200,
      },
    });
    rerender({
      draftId: "d1",
      result: withBlank,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 1200,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(repo.updateAdaptation).toHaveBeenCalledWith(
      "d1",
      { adaptation_result: withBlank },
      "2026-01-01T00:00:00Z",
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

  /**
   * Regressão: trocar de aba dispara `blur` E `visibilitychange` no mesmo tick,
   * então dois flushes entravam em performSave antes de o primeiro atualizar o
   * token otimista. Os dois mandavam o UPDATE com o mesmo `expected`; o segundo
   * casava 0 linhas, virava "conflict" e o wizard respondia com toast + navigate(0)
   * — recarga de página inteira num conflito que nunca existiu.
   */
  describe("concurrent saves", () => {
    /** An updateAdaptation that stays in flight until the test releases it. */
    function deferredUpdate() {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      let calls = 0;
      vi.mocked(repo.updateAdaptation).mockImplementation(async (_id, _patch, expected) => {
        calls += 1;
        await gate;
        // Only the FIRST writer still matches the row's updated_at; the server
        // bumps it, so any concurrent writer using the same token gets 0 rows.
        return expected === "2026-01-01T00:00:00Z" && calls === 1
          ? { ok: true, row: ROW }
          : { ok: false, conflict: true };
      });
      return { release: () => release(), calls: () => calls };
    }

    const props = {
      draftId: "d1",
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 5000,
    };

    it("collapses blur + visibilitychange into a single write", async () => {
      const update = deferredUpdate();
      const { rerender } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });
      rerender({ ...props, result: edited("tab-switch") });

      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      await act(async () => {
        window.dispatchEvent(new Event("blur"));
        document.dispatchEvent(new Event("visibilitychange"));
        await Promise.resolve();
        update.release();
        await vi.advanceTimersByTimeAsync(0);
      });
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });

      expect(update.calls()).toBe(1);
    });

    it("does not report a conflict when two flushes overlap", async () => {
      const update = deferredUpdate();
      const onConflict = vi.fn();
      const { result, rerender } = renderHook((p) => useAdaptationDraft(p), {
        initialProps: { ...props, onConflict },
      });
      rerender({ ...props, onConflict, result: edited("overlap") });

      await act(async () => {
        const a = result.current.flush();
        const b = result.current.flush();
        update.release();
        const [ra, rb] = await Promise.all([a, b]);
        expect(ra.status).toBe("saved");
        expect(rb.status).toBe("saved");
      });

      expect(onConflict).not.toHaveBeenCalled();
      expect(result.current.status).toBe("saved");
      expect(update.calls()).toBe(1);
    });

    it("an edit made mid-flight is written AFTER the save it arrived during", async () => {
      // Joining the in-flight save would be wrong here: it carries the OLD
      // document. The newer edit has to wait for that write to land (so the
      // optimistic token is fresh) and then persist on top of it.
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const seen: Array<[string, string]> = [];
      let first = true;
      vi.mocked(repo.updateAdaptation).mockImplementation(async (_id, patch, expected) => {
        const tag = (patch.adaptation_result as AdaptationResult).pedagogical_justification;
        if (first) {
          first = false;
          await gate;
          seen.push([tag, expected]);
          return { ok: true, row: { ...ROW, updated_at: "2026-03-03T00:00:00Z" } };
        }
        seen.push([tag, expected]);
        return { ok: true, row: ROW };
      });

      const { result, rerender } = renderHook((p) => useAdaptationDraft(p), {
        initialProps: props,
      });
      rerender({ ...props, result: edited("first") });

      let a!: Promise<unknown>;
      await act(async () => {
        a = result.current.flush();
      });
      // A keystroke lands while the first write is still open.
      rerender({ ...props, result: edited("second") });
      await act(async () => {
        const b = result.current.flush();
        release();
        await Promise.all([a, b]);
      });

      expect(seen).toEqual([
        ["first", "2026-01-01T00:00:00Z"],
        // Second write uses the token the FIRST one produced — not the stale one.
        ["second", "2026-03-03T00:00:00Z"],
      ]);
    });

    it("a queued save still runs when the write it waits on rejects outright", async () => {
      // The queue must not be poisoned by a rejection. `runSave` swallows repo
      // errors itself, but the mirror write sits ahead of its try/catch — so a
      // storage failure can reject the whole chain and, without the catch, take
      // every queued edit down with it.
      // The rejection has to land while the SECOND save is already queued behind
      // the first — otherwise the slot is free again and nothing ever waits on
      // the failed promise.
      let fail!: (e: Error) => void;
      vi.mocked(mirror.writeMirror).mockReturnValueOnce(
        new Promise<void>((_resolve, reject) => (fail = reject)),
      );
      const { result, rerender } = renderHook((p) => useAdaptationDraft(p), {
        initialProps: props,
      });
      rerender({ ...props, result: edited("doomed") });

      let first!: Promise<unknown>;
      await act(async () => {
        first = result.current.flush().catch(() => undefined);
      });
      rerender({ ...props, result: edited("survivor") });
      await act(async () => {
        const second = result.current.flush();
        fail(new Error("storage cheia"));
        await Promise.all([first, second]);
      });

      expect(repo.updateAdaptation).toHaveBeenCalledWith(
        "d1",
        { adaptation_result: edited("survivor") },
        "2026-01-01T00:00:00Z",
      );
    });

    it("a flush that lands while a debounced save is in flight still returns the fresh token", async () => {
      const update = deferredUpdate();
      const { result, rerender } = renderHook((p) => useAdaptationDraft(p), {
        initialProps: { ...props, debounceMs: 10 },
      });
      rerender({ ...props, debounceMs: 10, result: edited("debounce") });

      let flushed: Awaited<ReturnType<typeof result.current.flush>>;
      await act(async () => {
        // The debounce fires and starts a save...
        await vi.advanceTimersByTimeAsync(10);
        // ...and "Salvar" flushes on top of it.
        const pending = result.current.flush();
        update.release();
        flushed = await pending;
      });

      expect(flushed!.status).toBe("saved");
      expect(flushed!.updatedAt).toBe(ROW.updated_at);
      expect(update.calls()).toBe(1);
    });
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

  // --- B10: the optimistic token belongs to ONE draft ------------------------

  it("rebinds the optimistic token when a NEW draft is adopted (Nova adaptação)", async () => {
    // The token is a per-row value. Carrying the previous row's updated_at into
    // a freshly adopted draft makes its very first autosave conflict — which
    // the wizard answers with navigate(0), throwing the new work away.
    const props = {
      draftId: "d1" as string | null,
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z" as string | null,
      debounceMs: 500,
    };
    const { rerender } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });
    // Save once so the token advances past the mount value.
    rerender({ ...props, result: edited("first") });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(repo.updateAdaptation).toHaveBeenCalledTimes(1);

    // "Nova adaptação": the wizard clears the draft, then a new generation
    // hands over a different row with its own updated_at.
    rerender({ draftId: null, result: null as never, initialUpdatedAt: null, debounceMs: 500 });
    rerender({
      draftId: "d2",
      result: edited("second"),
      initialUpdatedAt: "2026-05-05T00:00:00Z",
      debounceMs: 500,
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(repo.updateAdaptation).toHaveBeenNthCalledWith(
      2,
      "d2",
      { adaptation_result: edited("second") },
      "2026-05-05T00:00:00Z",
    );
  });

  // --- B11: flush must not swallow a failed save -----------------------------

  it("flush() reports success with the token it produced", async () => {
    const props = {
      draftId: "d1",
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 5000,
    };
    const { rerender, result } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });
    rerender({ ...props, result: edited("ok") });
    let outcome: Awaited<ReturnType<typeof result.current.flush>> | null = null;
    await act(async () => { outcome = await result.current.flush(); });
    expect(outcome).toEqual({ status: "saved", updatedAt: ROW.updated_at });
  });

  it("flush() reports success when there was nothing to save", async () => {
    const { result } = renderHook(() =>
      useAdaptationDraft({
        draftId: "d1",
        result: validResult,
        initialUpdatedAt: "2026-01-01T00:00:00Z",
      }),
    );
    let outcome: Awaited<ReturnType<typeof result.current.flush>> | null = null;
    await act(async () => { outcome = await result.current.flush(); });
    expect(outcome).toEqual({ status: "saved", updatedAt: "2026-01-01T00:00:00Z" });
  });

  it("flush() reports FAILURE when the save threw (caller must not claim 'Salvo')", async () => {
    vi.mocked(repo.updateAdaptation).mockRejectedValue(new Error("net"));
    const props = {
      draftId: "d1",
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 5000,
    };
    const { rerender, result } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });
    rerender({ ...props, result: edited("lost") });
    let outcome: Awaited<ReturnType<typeof result.current.flush>> | null = null;
    await act(async () => { outcome = await result.current.flush(); });
    expect(outcome).toEqual({ status: "failed", reason: "error" });
  });

  it("flush() reports FAILURE on a conflict", async () => {
    vi.mocked(repo.updateAdaptation).mockResolvedValue({ ok: false, conflict: true });
    const props = {
      draftId: "d1",
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 5000,
    };
    const { rerender, result } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });
    rerender({ ...props, result: edited("conflicted") });
    let outcome: Awaited<ReturnType<typeof result.current.flush>> | null = null;
    await act(async () => { outcome = await result.current.flush(); });
    expect(outcome).toEqual({ status: "failed", reason: "conflict" });
  });

  it("keeps the crash mirror when the save failed (it is the only surviving copy)", async () => {
    vi.mocked(repo.updateAdaptation).mockRejectedValue(new Error("net"));
    const props = {
      draftId: "d1",
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 500,
    };
    const { rerender } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });
    rerender({ ...props, result: edited("only-copy") });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(mirror.writeMirror).toHaveBeenCalledWith("d1", edited("only-copy"));
    expect(mirror.clearMirror).not.toHaveBeenCalled();
  });

  // --- B12: a write outside the autosave path also advances the row ----------

  it("syncUpdatedAt adopts a token produced elsewhere (markReady)", async () => {
    // markReady flips status='ready', which the BEFORE UPDATE trigger stamps
    // with a new updated_at. Without adopting it, the next keystroke autosaves
    // against a token the server has already moved past → conflict → reload.
    const props = {
      draftId: "d1",
      result: validResult,
      initialUpdatedAt: "2026-01-01T00:00:00Z",
      debounceMs: 500,
    };
    const { rerender, result } = renderHook((p) => useAdaptationDraft(p), { initialProps: props });

    act(() => { result.current.syncUpdatedAt("2026-03-03T00:00:00Z"); });
    expect(result.current.currentUpdatedAt).toBe("2026-03-03T00:00:00Z");

    rerender({ ...props, result: edited("after-save") });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(repo.updateAdaptation).toHaveBeenCalledWith(
      "d1",
      { adaptation_result: edited("after-save") },
      "2026-03-03T00:00:00Z",
    );
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
