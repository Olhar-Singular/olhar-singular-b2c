// Self-service refund of the last charge, with dependencies injected so the
// decisions are unit-tested away from Deno and Supabase.
//
// Mercado Pago is called FIRST: a non-2xx refund must not touch the DB or
// try to cancel the preapproval (nothing changed on the provider's side, so
// nothing should change on ours). The idempotency key is refund:<invoiceId>,
// so a client retry after a timeout, or a replay after confirmRefund threw,
// repeats the exact same POST at MP instead of double-refunding.

export interface RefundableCharge {
  invoiceId: string;
  mpPaymentId: string;
  amountBrl: number;
  subscriptionId: string;
  mpPreapprovalId: string | null;
}

export interface RefundDeps {
  /** RPC refund_last_charge: the eligible charge or null (nothing_to_refund). */
  findRefundable(userId: string): Promise<RefundableCharge | null>;
  /** POST /v1/payments/{id}/refunds with X-Idempotency-Key; returns MP's refund id when 2xx. */
  postRefund(mpPaymentId: string, idempotencyKey: string): Promise<{ ok: boolean; status: number; refundId: string | null; message: string | null }>;
  /** GET /v1/payments/{id}; confirms the refund state at MP after a non-2xx POST (a timeout does not mean the refund never landed). Non-2xx -> null. */
  getPaymentRefundState(mpPaymentId: string): Promise<{ refunded: boolean; refundId: string | null } | null>;
  /** PUT /preapproval/{id} { status: 'cancelled' }; best effort, never throws. */
  cancelPreapproval(preapprovalId: string): Promise<boolean>;
  /** RPC confirm_refund. */
  confirmRefund(invoiceId: string, mpRefundId: string): Promise<{ success?: boolean; already?: boolean; error?: string; credits_removed?: number } | null>;
  now(): Date;
  log(message: string, ...args: unknown[]): void;
}

export type RefundResult =
  | { ok: true; amountBrl: number; refundedAt: string; subscriptionId: string; invoiceId: string; creditsRemoved: number }
  | { ok: false; error: "nothing_to_refund"; httpStatus: number }
  | { ok: false; error: "provider_error"; httpStatus: number; permanent: boolean };

export async function runRefundLastCharge(input: { userId: string }, deps: RefundDeps): Promise<RefundResult> {
  const charge = await deps.findRefundable(input.userId);
  if (!charge) return { ok: false, error: "nothing_to_refund", httpStatus: 409 };

  const idempotencyKey = `refund:${charge.invoiceId}`;
  const refund = await deps.postRefund(charge.mpPaymentId, idempotencyKey);
  let refundId = refund.refundId;
  if (!refund.ok) {
    deps.log("refund-last-charge: MP refused", refund.status, refund.message);
    // A non-2xx does not mean the refund never happened (a timeout can still land at MP):
    // check before giving up, so a replay after a failed confirm does not double-refund.
    const state = await deps.getPaymentRefundState(charge.mpPaymentId);
    if (state?.refunded) {
      deps.log("refund-last-charge: MP confirms the refund already existed (replay after a failed confirm)");
      refundId = state.refundId;
    } else {
      const permanent = refund.status >= 400 && refund.status < 500;
      return { ok: false, error: "provider_error", httpStatus: 502, permanent };
    }
  }

  if (charge.mpPreapprovalId) {
    let cancelled = await deps.cancelPreapproval(charge.mpPreapprovalId);
    if (!cancelled) cancelled = await deps.cancelPreapproval(charge.mpPreapprovalId);
    if (!cancelled) deps.log("refund-last-charge: ALERT preapproval not cancelled at MP", charge.mpPreapprovalId);
  }

  if (refundId === null) {
    deps.log("refund-last-charge: MP answered 2xx with no refund id, falling back to 'unknown'");
    refundId = "unknown";
  }

  const confirmed = await deps.confirmRefund(charge.invoiceId, refundId);

  return {
    ok: true,
    amountBrl: charge.amountBrl,
    refundedAt: deps.now().toISOString(),
    subscriptionId: charge.subscriptionId,
    invoiceId: charge.invoiceId,
    creditsRemoved: confirmed?.already ? 0 : (confirmed?.credits_removed ?? 0),
  };
}
