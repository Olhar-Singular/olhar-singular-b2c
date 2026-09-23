// =============================================================================
// Shared credit-charging logic for edge functions.
//
// Deliberately free of any Supabase import: callers inject the few async
// operations they need (claim the free slot, run the deduct RPC, run the grant
// RPC). This keeps the money-critical branching unit-testable in isolation and
// identical across every function that consumes credits.
// =============================================================================

/** Shape of the jsonb returned by the credit RPCs (consume/deduct/grant/reserve). */
export interface CreditRpcResult {
  success?: boolean;
  error?: string;
  /** "charged" | "exempt" (consume_credits and the reservation RPCs). */
  mode?: string;
  balance?: number;
  plan_balance?: number;
  extra_balance?: number;
  plan_charged?: number;
  extra_charged?: number;
  new_balance?: number;
}

/** Raised when a money RPC fails, so the failure cannot be silently ignored. */
export class CreditRpcError extends Error {
  /** The raw supabase-js error (or failure payload) behind this failure. */
  override cause: unknown;

  constructor(label: string, cause: unknown) {
    super(`${label} failed: ${describeCause(cause)}`);
    this.name = "CreditRpcError";
    this.cause = cause;
  }
}

function describeCause(cause: unknown): string {
  if (typeof cause === "string") return cause;
  const message = (cause as { message?: unknown } | null)?.message;
  if (typeof message === "string") return message;
  return "unknown error";
}

/**
 * Run a money-moving RPC and turn EVERY failure mode into a thrown error.
 *
 * supabase-js RESOLVES on a database error — it returns `{ data, error }` and
 * never rejects. So `await client.rpc("grant_credits", …)` without reading
 * `error` looks exactly like a success: a refund guard's try/catch never fires,
 * its onError reporter is dead code, and the user silently loses the credits
 * they paid for with nothing in the logs. Route every credit RPC through this.
 */
export async function runCreditRpc(
  label: string,
  // PromiseLike, not Promise: supabase-js rpc() returns a thenable builder.
  invoke: () => PromiseLike<{ data: CreditRpcResult | null; error: unknown }>,
): Promise<CreditRpcResult | null> {
  const { data, error } = await invoke();
  if (error) throw new CreditRpcError(label, error);
  if (data?.success === false) throw new CreditRpcError(label, data.error ?? null);
  return data;
}

/** Outcome of an attempt to charge a user for an action. */
export type ChargeOutcome =
  /** Legacy free-first slot (no caller uses it anymore; kept for the type). */
  | { status: "free"; creditsCharged: 0 }
  /** Courtesy account: the RPC recorded usage but moved nothing. */
  | { status: "exempt"; creditsCharged: 0 }
  | {
      status: "charged";
      creditsCharged: number;
      planCharged: number;
      extraCharged: number;
      newBalance: number;
    }
  | {
      status: "insufficient";
      balance: number | null;
      planBalance: number | null;
      extraBalance: number | null;
    }
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
      return {
        status: "insufficient",
        balance: data.balance ?? null,
        planBalance: data.plan_balance ?? null,
        extraBalance: data.extra_balance ?? null,
      };
    }
    return { status: "error", reason: "failure" };
  }
  if (data?.mode === "exempt") {
    return { status: "exempt", creditsCharged: 0 };
  }
  // A payload without the split (older RPC) means everything came from extras.
  const planCharged = data?.plan_charged ?? 0;
  return {
    status: "charged",
    creditsCharged: deps.cost,
    planCharged,
    extraCharged: data?.extra_charged ?? deps.cost - planCharged,
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
      body: {
        error: "Créditos insuficientes.",
        reason: "insufficient_credits",
        balance: outcome.balance,
        plan_balance: outcome.planBalance,
        extra_balance: outcome.extraBalance,
        required: cost,
      },
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
