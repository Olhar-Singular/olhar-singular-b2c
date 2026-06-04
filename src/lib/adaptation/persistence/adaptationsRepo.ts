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
  credits_spent: number;
  created_at: string;
  updated_at: string;
};

/** A list item omits the heavy result blob to keep the history list lean. */
export type AdaptationListItem = Omit<AdaptationRow, "adaptation_result">;

/** The data needed to create/update an adaptation. */
export type AdaptationPayload = {
  user_id: string;
  title: string;
  original_activity: string;
  activity_type: string | null;
  barrier_profile_id: string | null;
  barriers_used: unknown;
  observation_notes: string | null;
  adaptation_result: AdaptationResult;
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

/** Insert a new draft row and return it. */
export async function saveDraft(payload: AdaptationPayload): Promise<AdaptationRow> {
  const adaptation_result = assertValidResult(payload.adaptation_result);
  const { data, error } = await table()
    .insert({
      ...payload,
      barriers_used: payload.barriers_used as Json,
      adaptation_result: adaptation_result as unknown as Json,
      status: "draft",
    })
    .select("*")
    .single();
  if (error) throw error;
  return parseRow(data as Record<string, unknown>);
}

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
): Promise<MarkReadyResult> {
  const { data, error } = await table()
    .update({ status: "ready" })
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
      "id,user_id,barrier_profile_id,title,original_activity,activity_type,barriers_used,observation_notes,status,credits_spent,created_at,updated_at",
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

/** Delete an adaptation by id. */
export async function deleteAdaptation(id: string): Promise<void> {
  const { error } = await table().delete().eq("id", id);
  if (error) throw error;
}
