// =============================================================================
// Server-side persistence of a generated adaptation.
//
// WHY THE SERVER WRITES THE ROW (and not the client):
// the request already reserved and charged the user (see creditReservation.ts).
// While the INSERT lived in the browser, everything between the 200 and the
// client's first save was a window where the user had paid and the document
// existed nowhere durable: closing the tab, a failed insert, or the wizard
// aborting the request after the response all destroyed the only copy.
//
// So the row is written HERE, before the reservation is settled: if the write
// fails the charge is reversed and nothing was sold. `request_id` — the same
// idempotency key the reservation uses — is stored on the row and uniquely
// indexed, so a replay can never leave two adaptations behind either.
//
// Kept Supabase-free (the client is injected) so every branch is unit-testable.
// =============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_TITLE_CHARS = 80;

/** Everything the row needs that is not already a column-shaped value. */
export interface PersistAdaptationInput {
  userId: string;
  /** The reservation id: doubles as this row's idempotency key. */
  requestId: string;
  originalActivity: string;
  activityType: unknown;
  barrierProfileId: unknown;
  barriersUsed: unknown;
  observationNotes: unknown;
  adaptationResult: unknown;
  creditsCharged: number;
}

export interface PersistedAdaptation {
  id: string;
  updatedAt: string;
}

export type PersistAdaptationResult =
  | { ok: true; row: PersistedAdaptation }
  | { ok: false; error: unknown };

/** The narrow slice of a supabase client this module needs. */
export interface AdaptationInsertClient {
  from(table: string): {
    insert(row: Record<string, unknown>): {
      select(columns: string): {
        single(): Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
}

/**
 * Human title for the history list, derived from the first line of the pasted
 * activity. Mirrors what the client used to do at insert time — the "Título"
 * field on the Exportar step overwrites it later via the autosave patch.
 */
export function deriveAdaptationTitle(activityText: string): string {
  const trimmed = activityText.trim();
  if (!trimmed) return "Adaptação sem título";
  const firstLine = trimmed.split("\n")[0];
  return firstLine.length > MAX_TITLE_CHARS
    ? `${firstLine.slice(0, MAX_TITLE_CHARS - 3)}…`
    : firstLine;
}

function asTextOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** A non-uuid would blow up the FK; treat it as "no profile" instead. */
function asUuidOrNull(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

/** Map the request + validated AI result into the `adaptations` insert row. */
export function buildAdaptationInsert(
  input: PersistAdaptationInput,
): Record<string, unknown> {
  return {
    user_id: input.userId,
    request_id: input.requestId,
    title: deriveAdaptationTitle(input.originalActivity),
    original_activity: input.originalActivity,
    activity_type: asTextOrNull(input.activityType),
    barrier_profile_id: asUuidOrNull(input.barrierProfileId),
    barriers_used: Array.isArray(input.barriersUsed) ? input.barriersUsed : [],
    observation_notes: asTextOrNull(input.observationNotes),
    adaptation_result: input.adaptationResult,
    status: "draft",
    credits_spent: input.creditsCharged,
  };
}

/**
 * Write the draft row. Never throws: the caller turns a failure into a refund.
 *
 * supabase-js RESOLVES with `{ error }` on a DB failure instead of rejecting,
 * so an unchecked `await insert()` would look like success and we would settle
 * a charge for a document that was never stored.
 */
export async function persistAdaptation(
  client: AdaptationInsertClient,
  input: PersistAdaptationInput,
): Promise<PersistAdaptationResult> {
  try {
    const { data, error } = await client
      .from("adaptations")
      .insert(buildAdaptationInsert(input))
      .select("id,updated_at")
      .single();
    if (error) return { ok: false, error };
    if (!data) return { ok: false, error: new Error("adaptation insert returned no row") };
    const row = data as { id: string; updated_at: string };
    return { ok: true, row: { id: row.id, updatedAt: row.updated_at } };
  } catch (e) {
    return { ok: false, error: e };
  }
}
