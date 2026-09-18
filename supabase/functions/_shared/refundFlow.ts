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
  /** PUT /preapproval/{id} { status: 'cancelled' }; best effort, never throws. */
  cancelPreapproval(preapprovalId: string): Promise<boolean>;
  /** RPC confirm_refund. */
  confirmRefund(invoiceId: string, mpRefundId: string): Promise<{ success?: boolean; already?: boolean; error?: string; credits_removed?: number } | null>;
  now(): Date;
  log(message: string, ...args: unknown[]): void;
}

export type RefundResult =
  | { ok: true; amountBrl: number; refundedAt: string; subscriptionId: string; invoiceId: string; creditsRemoved: number }
  | { ok: false; error: "nothing_to_refund" | "provider_error"; httpStatus: number };

export async function runRefundLastCharge(input: { userId: string }, deps: RefundDeps): Promise<RefundResult> {
  const charge = await deps.findRefundable(input.userId);
  if (!charge) return { ok: false, error: "nothing_to_refund", httpStatus: 409 };

  const idempotencyKey = `refund:${charge.invoiceId}`;
  const refund = await deps.postRefund(charge.mpPaymentId, idempotencyKey);
  if (!refund.ok) {
    deps.log("refund-last-charge: MP refused", refund.status, refund.message);
    return { ok: false, error: "provider_error", httpStatus: 502 };
  }

  if (charge.mpPreapprovalId) {
    const cancelled = await deps.cancelPreapproval(charge.mpPreapprovalId);
    if (!cancelled) deps.log("refund-last-charge: could not cancel the preapproval at MP", charge.mpPreapprovalId);
  }

  let refundId = refund.refundId;
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
