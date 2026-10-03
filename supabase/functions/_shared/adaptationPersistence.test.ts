import { describe, it, expect, vi } from "vitest";
import { FALLBACK_TITLE as CLIENT_FALLBACK_TITLE } from "@/components/adaptation/titleField";
import {
  FALLBACK_TITLE,
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
  adaptationResult: {
    schemaVersion: 1,
    document: {
      schemaVersion: 1,
      blocks: [{ type: "heading", id: "h1", level: 1, content: [{ type: "text", text: "Avaliação de Matemática" }] }],
    },
  },
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

/** An AI result whose document carries the given blocks (and optional header). */
function resultWith(blocks: unknown[], header?: unknown) {
  return { schemaVersion: 1, document: { schemaVersion: 1, blocks }, ...(header ? { header } : {}) };
}

const heading = (text: string) => ({
  type: "heading",
  id: "h1",
  level: 1,
  content: [{ type: "text", text }],
});

describe("deriveAdaptationTitle", () => {
  // Achado 0458: the list showed the raw first line of the pasted activity
  // ("1) Quanto e metade de 10? a) 2 b) 5 c) 10") while the Revisar step
  // suggested the document heading. Both must come from the same source.
  it("uses the first heading of the generated document, not the pasted text", () => {
    const result = resultWith([
      { type: "paragraph", id: "p0", content: [{ type: "text", text: "intro" }] },
      heading("Avaliação de Matemática"),
      heading("Outra seção"),
    ]);
    expect(deriveAdaptationTitle(result)).toBe("Avaliação de Matemática");
  });

  it("joins only the text nodes of the heading and trims it", () => {
    const result = resultWith([
      {
        type: "heading",
        id: "h1",
        level: 1,
        content: [
          { type: "text", text: "  Frações " },
          { type: "math_inline", latex: "x" },
          { type: "text", text: "e decimais  " },
        ],
      },
    ]);
    expect(deriveAdaptationTitle(result)).toBe("Frações e decimais");
  });

  it("prefers a manual header.title when the document already has one", () => {
    const result = resultWith([heading("Avaliação")], { title: "  Prova do João  " });
    expect(deriveAdaptationTitle(result)).toBe("Prova do João");
  });

  it("ignores a blank header.title", () => {
    const result = resultWith([heading("Avaliação")], { title: "   " });
    expect(deriveAdaptationTitle(result)).toBe("Avaliação");
  });

  it("falls back to the same name the Revisar suggests when there is no usable heading", () => {
    expect(deriveAdaptationTitle(resultWith([]))).toBe("Atividade adaptada");
    expect(deriveAdaptationTitle(resultWith([heading("   ")]))).toBe("Atividade adaptada");
    expect(deriveAdaptationTitle(resultWith([{ type: "heading", id: "h", level: 1 }])))
      .toBe("Atividade adaptada");
  });

  it("keeps the fallback in sync with the one the Revisar suggests", () => {
    expect(FALLBACK_TITLE).toBe(CLIENT_FALLBACK_TITLE);
  });

  it("falls back when the result is not shaped like a document", () => {
    expect(deriveAdaptationTitle(null)).toBe("Atividade adaptada");
    expect(deriveAdaptationTitle({})).toBe("Atividade adaptada");
    expect(deriveAdaptationTitle({ document: { blocks: "nope" } })).toBe("Atividade adaptada");
    expect(deriveAdaptationTitle({ document: { blocks: [null, heading("Ok")] } })).toBe("Ok");
  });

  it("truncates a very long title", () => {
    const title = deriveAdaptationTitle(resultWith([heading("a".repeat(200))]));
    expect(title).toHaveLength(78);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("buildAdaptationInsert", () => {
  it("maps the request + AI result into a draft row keyed by request_id", () => {
    expect(buildAdaptationInsert(BASE)).toEqual({
      user_id: BASE.userId,
      request_id: BASE.requestId,
      title: "Avaliação de Matemática",
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
