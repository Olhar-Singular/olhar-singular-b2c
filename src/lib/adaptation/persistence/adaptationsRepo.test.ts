import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  saveDraft,
  updateAdaptation,
  markReady,
  listAdaptations,
  getAdaptation,
  deleteAdaptation,
  type AdaptationPayload,
} from "./adaptationsRepo";
import { supabase } from "@/integrations/supabase/client";
import { validResult } from "./__fixtures__/result";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

const baseRow = {
  id: "a1",
  user_id: "u1",
  barrier_profile_id: null,
  title: "T",
  original_activity: "atividade",
  activity_type: "prova",
  barriers_used: [],
  observation_notes: "minhas notas",
  adaptation_result: validResult,
  status: "draft",
  credits_spent: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const payload: AdaptationPayload = {
  user_id: "u1",
  title: "T",
  original_activity: "atividade",
  activity_type: "prova",
  barrier_profile_id: null,
  barriers_used: [],
  observation_notes: "minhas notas",
  adaptation_result: validResult,
};

/** Builds a chainable supabase mock; terminal resolves to `result`. */
function buildChain(result: { data: unknown; error: unknown }, overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    ...overrides,
  };
  return chain;
}

describe("adaptationsRepo", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("saveDraft", () => {
    it("inserts a draft and returns the parsed row", async () => {
      const chain = buildChain({ data: baseRow, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      const row = await saveDraft(payload);
      expect(supabase.from).toHaveBeenCalledWith("adaptations");
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "draft",
          user_id: "u1",
          observation_notes: "minhas notas",
        }),
      );
      expect(row.id).toBe("a1");
      expect(row.adaptation_result).toEqual(validResult);
    });

    it("throws on supabase error", async () => {
      const chain = buildChain({ data: null, error: { message: "boom" } });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      await expect(saveDraft(payload)).rejects.toEqual({ message: "boom" });
    });

    it("throws when the result blob is invalid (write-side validation)", async () => {
      const chain = buildChain({ data: baseRow, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      const bad = { ...payload, adaptation_result: { junk: true } as never };
      await expect(saveDraft(bad)).rejects.toBeInstanceOf(Error);
      expect(chain.insert).not.toHaveBeenCalled();
    });
  });

  describe("updateAdaptation", () => {
    it("updates with optimistic concurrency and returns the row", async () => {
      const updated = { ...baseRow, title: "New", updated_at: "2026-01-02T00:00:00Z" };
      const chain = buildChain({ data: updated, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      const res = await updateAdaptation("a1", { title: "New" }, "2026-01-01T00:00:00Z");
      expect(chain.eq).toHaveBeenCalledWith("id", "a1");
      expect(chain.eq).toHaveBeenCalledWith("updated_at", "2026-01-01T00:00:00Z");
      expect(res).toEqual({ ok: true, row: expect.objectContaining({ title: "New" }) });
    });

    it("persists observation_notes in the update patch", async () => {
      const chain = buildChain({ data: baseRow, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      await updateAdaptation("a1", { observation_notes: "nota nova" }, "2026-01-01T00:00:00Z");
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ observation_notes: "nota nova" }),
      );
    });

    it("validates the result blob when present in the patch", async () => {
      const chain = buildChain({ data: baseRow, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      const res = await updateAdaptation(
        "a1",
        { adaptation_result: validResult },
        "2026-01-01T00:00:00Z",
      );
      expect(res.ok).toBe(true);
    });

    it("passes barriers_used through the patch when present", async () => {
      const chain = buildChain({ data: baseRow, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      const barriers = [{ dimension: "tea", barrier_key: "x", is_active: true }];
      await updateAdaptation("a1", { barriers_used: barriers }, "2026-01-01T00:00:00Z");
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ barriers_used: barriers }),
      );
    });

    it("returns a conflict result when 0 rows match (stale updated_at)", async () => {
      const chain = buildChain({ data: null, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      const res = await updateAdaptation("a1", { title: "x" }, "stale");
      expect(res).toEqual({ ok: false, conflict: true });
    });

    it("throws on supabase error", async () => {
      const chain = buildChain({ data: null, error: { message: "fail" } });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      await expect(updateAdaptation("a1", { title: "x" }, "t")).rejects.toEqual({ message: "fail" });
    });

    it("throws when the patched result blob is invalid", async () => {
      const chain = buildChain({ data: baseRow, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      await expect(
        updateAdaptation("a1", { adaptation_result: { junk: true } as never }, "t"),
      ).rejects.toBeInstanceOf(Error);
    });
  });

  describe("markReady", () => {
    it("flips status to ready with an optimistic guard and returns the new updated_at", async () => {
      const ready = { ...baseRow, status: "ready", updated_at: "2026-01-03T00:00:00Z" };
      const chain = buildChain({ data: ready, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      const res = await markReady("a1", "2026-01-01T00:00:00Z");
      expect(chain.update).toHaveBeenCalledWith({ status: "ready" });
      expect(chain.eq).toHaveBeenCalledWith("id", "a1");
      expect(chain.eq).toHaveBeenCalledWith("updated_at", "2026-01-01T00:00:00Z");
      expect(res).toEqual({ ok: true, updatedAt: "2026-01-03T00:00:00Z" });
    });

    it("returns a conflict result when 0 rows match (stale updated_at)", async () => {
      const chain = buildChain({ data: null, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      const res = await markReady("a1", "stale");
      expect(res).toEqual({ ok: false, conflict: true });
    });

    it("throws on supabase error", async () => {
      const chain = buildChain({ data: null, error: { message: "no" } });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      await expect(markReady("a1", "t")).rejects.toEqual({ message: "no" });
    });
  });

  describe("listAdaptations", () => {
    it("returns the list ordered by updated_at desc", async () => {
      const item = { ...baseRow };
      delete (item as Record<string, unknown>).adaptation_result;
      const chain = buildChain({ data: [item], error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      const list = await listAdaptations();
      expect(chain.order).toHaveBeenCalledWith("updated_at", { ascending: false });
      expect(list).toHaveLength(1);
    });

    it("returns an empty array when data is null", async () => {
      const chain = buildChain({ data: null, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      expect(await listAdaptations()).toEqual([]);
    });

    it("throws on supabase error", async () => {
      const chain = buildChain({ data: null, error: { message: "list-fail" } });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      await expect(listAdaptations()).rejects.toEqual({ message: "list-fail" });
    });
  });

  describe("getAdaptation", () => {
    it("returns the parsed row", async () => {
      const chain = buildChain({ data: baseRow, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      const row = await getAdaptation("a1");
      expect(chain.eq).toHaveBeenCalledWith("id", "a1");
      expect(row.id).toBe("a1");
    });

    it("throws on supabase error", async () => {
      const chain = buildChain({ data: null, error: { message: "404" } });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      await expect(getAdaptation("a1")).rejects.toEqual({ message: "404" });
    });

    it("throws when the stored blob is invalid (read-side validation)", async () => {
      const chain = buildChain({ data: { ...baseRow, adaptation_result: { junk: 1 } }, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      await expect(getAdaptation("a1")).rejects.toBeInstanceOf(Error);
    });

    it("surfaces a controlled error for an unknown schemaVersion (forward-compat routing)", async () => {
      const future = { ...validResult, schemaVersion: 99 };
      const chain = buildChain({ data: { ...baseRow, adaptation_result: future }, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      await expect(getAdaptation("a1")).rejects.toThrow(/Unsupported adaptation_result schemaVersion/);
    });

    it("passes a schemaVersion:1 blob through migration into the parsed row", async () => {
      const chain = buildChain({ data: baseRow, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      const row = await getAdaptation("a1");
      expect(row.adaptation_result).toEqual(validResult);
    });
  });

  describe("deleteAdaptation", () => {
    it("deletes by id", async () => {
      const chain = buildChain({ data: null, error: null }, { eq: vi.fn().mockResolvedValue({ error: null }) });
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      await deleteAdaptation("a1");
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith("id", "a1");
    });

    it("throws on supabase error", async () => {
      const chain = buildChain(
        { data: null, error: null },
        { eq: vi.fn().mockResolvedValue({ error: { message: "del-fail" } }) },
      );
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      await expect(deleteAdaptation("a1")).rejects.toEqual({ message: "del-fail" });
    });
  });
});
