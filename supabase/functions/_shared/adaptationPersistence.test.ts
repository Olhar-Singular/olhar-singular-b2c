import { describe, it, expect, vi } from "vitest";
import {
  deriveAdaptationTitle,
  buildAdaptationInsert,
  persistAdaptation,
  type AdaptationInsertClient,
  type PersistAdaptationInput,
} from "./adaptationPersistence";

const BASE: PersistAdaptationInput = {
  userId: "11111111-1111-4111-8111-111111111111",
  requestId: "22222222-2222-4222-8222-222222222222",
  originalActivity: "1) Quanto é 2+2?\nsegunda linha",
  activityType: "prova",
  barrierProfileId: "33333333-3333-4333-8333-333333333333",
  barriersUsed: [{ dimension: "tea", barrier_key: "foco" }],
  observationNotes: "notas",
  adaptationResult: { schemaVersion: 1, document: { schemaVersion: 1, blocks: [] } },
  creditsCharged: 12,
};

/** Minimal supabase-js insert chain double. */
function clientStub(outcome: { data?: unknown; error?: unknown; throws?: unknown }) {
  const single = vi.fn(async () => {
    if (outcome.throws) throw outcome.throws;
    return { data: outcome.data ?? null, error: outcome.error ?? null };
  });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { client: { from } as unknown as AdaptationInsertClient, from, insert, select, single };
}

describe("deriveAdaptationTitle", () => {
  it("uses the first line of the activity text", () => {
    expect(deriveAdaptationTitle("Primeira linha\nsegunda")).toBe("Primeira linha");
  });

  it("falls back to a placeholder when the text is blank", () => {
    expect(deriveAdaptationTitle("   ")).toBe("Adaptação sem título");
  });

  it("truncates a very long first line", () => {
    const title = deriveAdaptationTitle("a".repeat(200));
    expect(title).toHaveLength(78);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("buildAdaptationInsert", () => {
  it("maps the request + AI result into a draft row keyed by request_id", () => {
    expect(buildAdaptationInsert(BASE)).toEqual({
      user_id: BASE.userId,
      request_id: BASE.requestId,
      title: "1) Quanto é 2+2?",
      original_activity: BASE.originalActivity,
      activity_type: "prova",
      barrier_profile_id: BASE.barrierProfileId,
      barriers_used: BASE.barriersUsed,
      observation_notes: "notas",
      adaptation_result: BASE.adaptationResult,
      status: "draft",
      credits_spent: 12,
    });
  });

  it("nulls a barrier_profile_id that is not a uuid (it is a foreign key)", () => {
    expect(buildAdaptationInsert({ ...BASE, barrierProfileId: "not-a-uuid" }))
      .toMatchObject({ barrier_profile_id: null });
    expect(buildAdaptationInsert({ ...BASE, barrierProfileId: undefined }))
      .toMatchObject({ barrier_profile_id: null });
  });

  it("coerces non-string activity_type / observation_notes to null", () => {
    expect(buildAdaptationInsert({ ...BASE, activityType: 42, observationNotes: "" }))
      .toMatchObject({ activity_type: null, observation_notes: null });
  });

  it("defaults barriers_used to an empty array when not a list", () => {
    expect(buildAdaptationInsert({ ...BASE, barriersUsed: "nope" }))
      .toMatchObject({ barriers_used: [] });
  });
});

describe("persistAdaptation", () => {
  it("inserts the draft row and returns its id + updated_at", async () => {
    const { client, from, insert, single } = clientStub({
      data: { id: "row-1", updated_at: "2026-07-23T10:00:00Z" },
    });

    const res = await persistAdaptation(client, BASE);

    expect(from).toHaveBeenCalledWith("adaptations");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ request_id: BASE.requestId, status: "draft" }),
    );
    expect(single).toHaveBeenCalled();
    expect(res).toEqual({ ok: true, row: { id: "row-1", updatedAt: "2026-07-23T10:00:00Z" } });
  });

  it("reports failure when supabase RESOLVES with an error (it never rejects)", async () => {
    const { client } = clientStub({ error: { message: "boom" } });
    const res = await persistAdaptation(client, BASE);
    expect(res).toEqual({ ok: false, error: { message: "boom" } });
  });

  it("reports failure when no row comes back", async () => {
    const { client } = clientStub({ data: null });
    const res = await persistAdaptation(client, BASE);
    expect(res.ok).toBe(false);
  });

  it("reports failure when the call throws (transport down)", async () => {
    const boom = new Error("network");
    const { client } = clientStub({ throws: boom });
    const res = await persistAdaptation(client, BASE);
    expect(res).toEqual({ ok: false, error: boom });
  });
});
