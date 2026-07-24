// =============================================================================
// Crash-safe charging — the pure decisions around open_adapt_reservation.
//
// The money itself lives in SQL (open/settle/reverse + the reconciliation job)
// because only one transaction can make "reserve" and "charge" atomic, and only
// the database can make the reversal idempotent across a dead isolate and a
// scheduled job racing each other. What is left here is the interpretation of
// the RPC's payload — kept Supabase-free so it is unit-testable.
//
// See supabase/migrations/*_credit_reservations.sql and its pgTAP suite.
// =============================================================================

/** Raw jsonb returned by the open_adapt_reservation RPC. */
export interface OpenReservationPayload {
  success?: boolean;
  error?: string;
  mode?: string;
  credits_charged?: number;
  new_balance?: number;
  balance?: number;
}

/** What the request consumed, or why it may not proceed. */
export type ReservationOutcome =
  | { status: "free"; creditsCharged: 0 }
  | { status: "charged"; creditsCharged: number; newBalance: number }
  | { status: "insufficient"; balance: number | null }
  /** The request_id was already used: charging again would double-bill. */
  | { status: "duplicate" }
  | { status: "error" };

/** Decide what a reservation payload means. Unknown shapes are errors, never free passes. */
export function interpretReservation(
  data: OpenReservationPayload | null,
): ReservationOutcome {
  if (!data) return { status: "error" };

  if (data.success === false) {
    if (data.error === "duplicate_request") return { status: "duplicate" };
    if (data.error === "insufficient_credits") {
      return { status: "insufficient", balance: data.balance ?? null };
    }
    return { status: "error" };
  }

  if (data.mode === "free") return { status: "free", creditsCharged: 0 };
  if (data.mode === "charged") {
    return {
      status: "charged",
      creditsCharged: data.credits_charged ?? 0,
      newBalance: data.new_balance ?? 0,
    };
  }
  return { status: "error" };
}

/**
 * Map an outcome to an HTTP status + body, or null when the caller may proceed.
 */
export function reservationErrorResponse(
  outcome: ReservationOutcome,
  cost: number,
): { status: number; body: Record<string, unknown> } | null {
  if (outcome.status === "insufficient") {
    return {
      status: 402,
      body: { error: "Créditos insuficientes.", balance: outcome.balance, required: cost },
    };
  }
  if (outcome.status === "duplicate") {
    // 409, not 500: the client can tell "already done" from "broke" and stop
    // retrying with the same key.
    return { status: 409, body: { error: "Esta geração já foi processada." } };
  }
  if (outcome.status === "error") {
    return { status: 500, body: { error: "Erro ao processar créditos." } };
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RequestIdResult = { ok: true; id: string } | { ok: false };

/**
 * Resolve the idempotency key for this request.
 *
 * A client that sends one gets replay protection; an older client that sends
 * nothing still gets a reservation (and therefore crash safety), just without
 * cross-retry dedupe. A malformed id is refused rather than replaced, because
 * silently generating a different key would destroy the caller's protection
 * exactly when it thinks it has it.
 */
export function resolveRequestId(
  raw: unknown,
  generate: () => string,
): RequestIdResult {
  if (raw === undefined || raw === null) return { ok: true, id: generate() };
  if (typeof raw === "string" && UUID_RE.test(raw)) {
    return { ok: true, id: raw.toLowerCase() };
  }
  return { ok: false };
}
