// =============================================================================
// Refund guard — enforces the adapt-activity credit invariant in a single,
// unit-testable place: once a user is charged, EVERY non-success exit refunds
// exactly the charged amount, and the refund fires AT MOST ONCE regardless of
// how many error branches call it. Net charge on any failure is therefore zero.
//
// No URL imports: pure and fully covered by Vitest.
// =============================================================================

import { refundCredits } from "./credits.ts";

export interface RefundGuardDeps {
  /** Credits already debited from the user for this request. */
  creditsCharged: number;
  /** Grant `amount` credits back to the user (e.g. the grant_credits RPC). */
  grant: (amount: number) => Promise<void>;
  /** Optional reporter for refund failures (never thrown). */
  onError?: (e: unknown) => void;
}

export interface RefundGuard {
  /**
   * Refund the charged credits if not already refunded. Idempotent: safe to
   * call from every error path; only the first call performs the grant.
   */
  refundIfNeeded: () => Promise<void>;
}

/** Create a once-only refund guard around `refundCredits`. */
export function createRefundGuard(deps: RefundGuardDeps): RefundGuard {
  let consumed = false;
  return {
    refundIfNeeded: async () => {
      if (consumed) return;
      // Mark consumed BEFORE awaiting so concurrent/repeat calls cannot double-grant.
      consumed = true;
      await refundCredits({
        creditsCharged: deps.creditsCharged,
        grant: deps.grant,
        onError: deps.onError,
      });
    },
  };
}
