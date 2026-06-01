// =============================================================================
// Shared credit-charging logic for edge functions.
//
// Deliberately free of any Supabase import: callers inject the few async
// operations they need (claim the free slot, run the deduct RPC, run the grant
// RPC). This keeps the money-critical branching unit-testable in isolation and
// identical across every function that consumes credits.
// =============================================================================

/** Shape of the jsonb returned by the deduct_credits / grant_credits RPCs. */
export interface CreditRpcResult {
  success?: boolean;
  error?: string;
  balance?: number;
  new_balance?: number;
}

/** Outcome of an attempt to charge a user for an action. */
export type ChargeOutcome =
  | { status: "free"; creditsCharged: 0 }
  | { status: "charged"; creditsCharged: number; newBalance: number }
  | { status: "insufficient"; balance: number | null }
  // `reason` lets callers with bespoke messages distinguish an RPC transport
  // error from a logical failure; `cause` carries the raw error for logging.
  | { status: "error"; reason: "rpc" | "failure"; cause?: unknown };

export interface ChargeDeps {
  /** Credit cost of the action. */
  cost: number;
  /**
   * Atomically claim the user's one free use, resolving to true when this call
   * won the slot. For actions with no free tier, pass `() => Promise.resolve(false)`.
   */
  claimFree: () => Promise<boolean>;
  /** Invoke the deduct_credits RPC, returning the supabase-js { data, error } pair. */
  deduct: () => Promise<{ data: CreditRpcResult | null; error: unknown }>;
}

/**
 * Decide and apply the charge: free first, otherwise deduct. Never throws for
 * the expected failure modes — they are encoded in the returned ChargeOutcome.
 */
export async function chargeCredits(deps: ChargeDeps): Promise<ChargeOutcome> {
  if (await deps.claimFree()) {
    return { status: "free", creditsCharged: 0 };
  }

  const { data, error } = await deps.deduct();
  if (error) {
    return { status: "error", reason: "rpc", cause: error };
  }
  if (data?.success === false) {
    if (data.error === "insufficient_credits") {
      return { status: "insufficient", balance: data.balance ?? null };
    }
    return { status: "error", reason: "failure" };
  }
  return {
    status: "charged",
    creditsCharged: deps.cost,
    newBalance: data?.new_balance ?? 0,
  };
}

/**
 * Map a charge outcome to an HTTP status + body, or null when the caller may
 * proceed (free or successfully charged).
 */
export function chargeErrorResponse(
  outcome: ChargeOutcome,
  cost: number,
): { status: number; body: Record<string, unknown> } | null {
  if (outcome.status === "insufficient") {
    return {
      status: 402,
      body: { error: "Créditos insuficientes.", balance: outcome.balance, required: cost },
    };
  }
  if (outcome.status === "error") {
    return { status: 500, body: { error: "Erro ao processar créditos." } };
  }
  return null;
}

/**
 * Best-effort refund of credits charged earlier in the request, used when a
 * downstream step (e.g. the AI call) fails after the debit. Swallows refund
 * errors so they never mask the original failure; reports them via onError.
 */
export async function refundCredits(deps: {
  creditsCharged: number;
  grant: (amount: number) => Promise<void>;
  onError?: (e: unknown) => void;
}): Promise<void> {
  if (deps.creditsCharged <= 0) return;
  try {
    await deps.grant(deps.creditsCharged);
  } catch (e) {
    deps.onError?.(e);
  }
}
