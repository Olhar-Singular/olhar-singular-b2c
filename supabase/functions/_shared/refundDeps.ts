// Wiring of RefundDeps over Supabase + Mercado Pago, shared by
// refund-last-charge. No decisions here (those live in refundFlow.ts); the
// tests pin the RPC names/params and the MP endpoint so a typo cannot
// silently break a refund.

import type { RefundDeps, RefundableCharge } from "./refundFlow.ts";
import { mpRequest, cancelPreapprovalAtMp, MpTimeoutError } from "./mpHttp.ts";

// Structural slice of supabase-js so the builder is testable with a fake.
export interface RefundAdminClient {
  // deno-lint-ignore no-explicit-any
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<any>;
}

export function buildRefundDeps(
  admin: RefundAdminClient,
  mpAccessToken: string,
  fetchFn: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): RefundDeps {
  return {
    findRefundable: async (userId) => {
      const { data, error } = await admin.rpc("refund_last_charge", { p_user_id: userId });
      if (error) throw new Error(`refund_last_charge failed: ${error.message}`);
      if (!data?.success) return null;
      return {
        invoiceId: data.invoice_id,
        mpPaymentId: data.mp_payment_id,
        amountBrl: data.amount_brl,
        subscriptionId: data.subscription_id,
        mpPreapprovalId: data.mp_preapproval_id ?? null,
      } as RefundableCharge;
    },
    postRefund: async (mpPaymentId, idempotencyKey) => {
      try {
        const resp = await mpRequest(
          `/v1/payments/${encodeURIComponent(mpPaymentId)}/refunds`,
          { method: "POST", token: mpAccessToken, body: {}, idempotencyKey },
          fetchFn,
        );
        return {
          ok: resp.ok,
          status: resp.status,
          refundId: resp.json.id != null ? String(resp.json.id) : null,
          message: typeof resp.json.message === "string" ? resp.json.message : null,
        };
      } catch (e) {
        if (e instanceof MpTimeoutError) return { ok: false, status: 0, refundId: null, message: "timeout" };
        throw e;
      }
    },
    getPaymentRefundState: async (mpPaymentId) => {
      let resp;
      try {
        resp = await mpRequest(`/v1/payments/${encodeURIComponent(mpPaymentId)}`, { method: "GET", token: mpAccessToken }, fetchFn);
      } catch (e) {
        if (e instanceof MpTimeoutError) return null;
        throw e;
      }
      if (!resp.ok) return null;
      const transactionAmount = Number(resp.json.transaction_amount ?? Infinity);
      const refundedAmount = Number(resp.json.transaction_amount_refunded ?? 0);
      const refunded = resp.json.status === "refunded" || refundedAmount >= transactionAmount;
      const refunds = resp.json.refunds as Array<{ id?: unknown }> | undefined;
      const refundId = refunds?.[0]?.id != null ? String(refunds[0].id) : null;
      return { refunded, refundId };
    },
    cancelPreapproval: (preapprovalId) => cancelPreapprovalAtMp(preapprovalId, mpAccessToken, fetchFn),
    confirmRefund: async (invoiceId, mpRefundId) => {
      const { data, error } = await admin.rpc("confirm_refund", { p_invoice_id: invoiceId, p_mp_refund_id: mpRefundId });
      if (error) throw new Error(`confirm_refund failed: ${error.message}`);
      return data;
    },
    now,
    log: (message, ...args) => console.warn(message, ...args),
  };
}
