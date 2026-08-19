/**
 * Persistence boundary for the `adaptations` table.
 *
 * The row type (`AdaptationRow`) is defined HERE from our canonical types so the
 * `adaptation_result` blob carries the real `AdaptationResult` shape (the
 * generated `types.ts` only knows it as opaque `Json`). Column NAMES are
 * type-checked against the generated schema — `supabase.from("adaptations")` and
 * the insert/update payloads are no longer cast to `never`, so a column typo now
 * fails compilation instead of surfacing as a runtime PGRST error.
 *
 * The only remaining casts are narrow `Json` conversions on the jsonb fields
 * (`adaptation_result`, `barriers_used`): our concrete types are not structurally
 * assignable to the recursive `Json` type, but the blob is validated with
 * `AdaptationResultSchema` before every write and after every read (and routed
 * through `migrateByVersion` on read), so a malformed blob never silently
 * round-trips.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  AdaptationResultSchema,
  type AdaptationResult,
} from "@/lib/adaptation/canonical/schema";
import { migrateByVersion } from "@/lib/adaptation/canonical/migrate";

// ---------------------------------------------------------------------------
// Types — defined here, decoupled from the generated types.ts
// ---------------------------------------------------------------------------

export type AdaptationStatus = "draft" | "ready";

export type AdaptationRow = {
  id: string;
  user_id: string;
  barrier_profile_id: string | null;
  title: string;
  original_activity: string;
  activity_type: string | null;
  barriers_used: unknown;
  observation_notes: string | null;
  adaptation_result: AdaptationResult;
  status: AdaptationStatus;
  /**
   * The "folder" the teacher filed this under. NULL = unclassified: the server
   * INSERT never sets it (it runs before the credit charge is settled and must
   * not depend on anything the client chose), and 'Geral' is a real subject, so
   * it cannot double as the sentinel.
   */
  subject: string | null;
  /** Named folder the teacher filed it under. NULL = sem pasta. */
  folder_id: string | null;
  credits_spent: number;
  created_at: string;
  updated_at: string;
};

/** A list item omits the heavy result blob to keep the history list lean. */
export type AdaptationListItem = Omit<AdaptationRow, "adaptation_result">;

/**
 * The column-shaped fields of an adaptation.
 *
 * There is no client-side INSERT any more: the row is created by the
 * `adapt-activity` edge function, before it settles the credit charge (see
 * supabase/functions/_shared/adaptationPersistence.ts). This type now describes
 * what an UPDATE may patch.
 */
export type AdaptationPayload = {
  user_id: string;
  title: string;
  original_activity: string;
  activity_type: string | null;
  barrier_profile_id: string | null;
  barriers_used: unknown;
  observation_notes: string | null;
  adaptation_result: AdaptationResult;
  subject: string | null;
};

export type UpdateResult =
  | { ok: true; row: AdaptationRow }
  | { ok: false; conflict: true };

export type MarkReadyResult =
  | { ok: true; updatedAt: string }
  | { ok: false; conflict: true };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function table() {
  return supabase.from("adaptations");
}

/** Validate the result blob before writing; throws on malformed input. */
function assertValidResult(result: AdaptationResult): AdaptationResult {
  return AdaptationResultSchema.parse(result);
}

/**
 * Validate the result blob coming back from the DB; throws on malformed data.
 *
 * The blob is first routed through `migrateByVersion`, which inspects its
 * `schemaVersion` and rejects unknown/missing versions BEFORE the Zod parse.
 * This gives forward-compat version routing a single read-path home and turns a
 * future-version blob into a clear read error instead of an opaque Zod failure.
 */
function parseRow(raw: Record<string, unknown>): AdaptationRow {
  const migrated = migrateByVersion(raw.adaptation_result);
  if (!migrated.ok) {
    throw new Error(
      "Unsupported adaptation_result schemaVersion (unknown or missing)",
    );
  }
  const adaptation_result = AdaptationResultSchema.parse(migrated.value);
  return { ...(raw as unknown as AdaptationRow), adaptation_result };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Update an existing adaptation with optimistic concurrency: the update only
 * matches when `updated_at` still equals `expectedUpdatedAt`. If another writer
 * advanced the row first, 0 rows match → return a conflict result.
 */
export async function updateAdaptation(
  id: string,
  payload: Partial<AdaptationPayload>,
  expectedUpdatedAt: string,
): Promise<UpdateResult> {
  const patch: Record<string, Json | undefined> = { ...payload } as Record<
    string,
    Json | undefined
  >;
  if (payload.barriers_used !== undefined) {
    patch.barriers_used = payload.barriers_used as Json;
  }
  if (payload.adaptation_result !== undefined) {
    patch.adaptation_result = assertValidResult(
      payload.adaptation_result,
    ) as unknown as Json;
  }
  const { data, error } = await table()
    .update(patch)
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, conflict: true };
  return { ok: true, row: parseRow(data as Record<string, unknown>) };
}

/**
 * Flip an adaptation to the 'ready' status under optimistic concurrency.
 *
 * The update only matches while `updated_at` still equals `expectedUpdatedAt`;
 * if another writer advanced the row first, 0 rows match → conflict. On success
 * the freshly-bumped `updated_at` is returned so the caller can keep its
 * optimistic token in sync (the BEFORE UPDATE trigger bumps it on every write).
 */
export async function markReady(
  id: string,
  expectedUpdatedAt: string,
  /**
   * Filed alongside the status flip. `subject` and `folder_id` are columns, so
   * the autosave (which only ever patches the result blob) never carries them —
   * and doing either as a SECOND update would bump `updated_at` again, leaving
   * the caller's optimistic token one version behind.
   */
  patch: { subject?: string | null; folder_id?: string | null } = {},
): Promise<MarkReadyResult> {
  const { data, error } = await table()
    .update({ status: "ready", ...patch })
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select("updated_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, conflict: true };
  return { ok: true, updatedAt: (data as { updated_at: string }).updated_at };
}

/** List the current user's adaptations, newest-updated first (no result blob). */
export async function listAdaptations(): Promise<AdaptationListItem[]> {
  const { data, error } = await table()
    .select(
      "id,user_id,barrier_profile_id,title,original_activity,activity_type,barriers_used,observation_notes,status,subject,folder_id,credits_spent,created_at,updated_at",
    )
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as AdaptationListItem[];
}

/** Fetch a single adaptation by id, validating the result blob. */
export async function getAdaptation(id: string): Promise<AdaptationRow> {
  const { data, error } = await table().select("*").eq("id", id).single();
  if (error) throw error;
  return parseRow(data as Record<string, unknown>);
}

/**
 * Copy an adaptation into a brand-new row.
 *
 * This is the safe half of "salvar como nova". Doing that choice *inside* the
 * editor would mean racing the autosave — it writes to the original row every
 * ~1200ms from the first keystroke, so by the time any dialog appeared the
 * overwrite would already have happened, and "as new" would have to create a
 * copy AND roll the original back to its opening snapshot AND clear its crash
 * mirror. Here there is no autosave in flight, no optimistic token to rebind
 * and no mirror in play: it is a plain INSERT the owner is allowed to make.
 *
 * Deliberately NOT copied:
 * - `request_id`: it is the credit-reservation idempotency key, under a unique
 *   partial index. Reusing it would collide; the copy was never charged.
 * - `credits_spent`: 0, for the same reason — nobody paid for a copy.
 * `status` starts 'ready' because the teacher asked for this one explicitly.
 */
export async function duplicateAdaptation(id: string, title: string): Promise<AdaptationRow> {
  const source = await getAdaptation(id);
  const { data, error } = await table()
    .insert({
      user_id: source.user_id,
      title,
      original_activity: source.original_activity,
      activity_type: source.activity_type,
      barrier_profile_id: source.barrier_profile_id,
      barriers_used: source.barriers_used,
      observation_notes: source.observation_notes,
      adaptation_result: source.adaptation_result,
      subject: source.subject,
      status: "ready",
      credits_spent: 0,
    })
    .select("*")
    .single();
  if (error) throw error;
  return parseRow(data as Record<string, unknown>);
}

/** Delete an adaptation by id. */
export async function deleteAdaptation(id: string): Promise<void> {
  const { error } = await table().delete().eq("id", id);
  if (error) throw error;
}
