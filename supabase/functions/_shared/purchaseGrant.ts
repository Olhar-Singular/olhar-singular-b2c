// Approval and rejection of a credit purchase, shared by the Mercado Pago
// webhook and the synchronous card checkout.
//
// The money moves inside the database (approve_purchase_and_grant claims the
// pending row AND grants the credits in one transaction), so an edge isolate
// dying halfway can never leave a purchase approved without its credits. What
// lives here is the thin, Supabase-free interpretation of the RPC payload, so
// every caller reads the same outcome and every failure mode throws instead of
// being mistaken for success (supabase-js resolves on DB errors).

import { CreditRpcError, runCreditRpc, type CreditRpcResult } from "./credits.ts";

export interface PurchaseRpcClient {
  rpc(
    fn: "approve_purchase_and_grant" | "reject_pending_purchase",
    args: Record<string, unknown>,
  ): Promise<{ data: CreditRpcResult | null; error: unknown }>;
}

interface ApprovePayload extends CreditRpcResult {
  granted?: boolean;
  reason?: string;
  user_id?: string;
  credits?: number;
}

export type GrantResult =
  | { granted: true; userId: string; credits: number; newBalance: number }
  | { granted: false; reason: "already_processed" };

/** Throws a CreditRpcError on any transport or logical failure. */
export async function approvePurchaseAndGrant(
  client: PurchaseRpcClient,
  input: { purchaseId: string; paymentId: string },
): Promise<GrantResult> {
  const data = (await runCreditRpc("approve_purchase_and_grant", () =>
    client.rpc("approve_purchase_and_grant", {
      p_purchase_id: input.purchaseId,
      p_payment_id: input.paymentId,
    }))) as ApprovePayload | null;

  // An empty payload is not a grant. Treat it like the RPC failing.
  if (!data) throw new CreditRpcError("approve_purchase_and_grant", "empty payload");

  if (data.granted !== true) {
    return { granted: false, reason: "already_processed" };
  }
  return {
    granted: true,
    userId: data.user_id ?? "",
    credits: data.credits ?? 0,
    newBalance: data.new_balance ?? 0,
  };
}

interface RejectPayload extends CreditRpcResult {
  rejected?: boolean;
}

export async function rejectPendingPurchase(
  client: PurchaseRpcClient,
  input: { purchaseId: string; paymentId: string | null; statusDetail: string | null },
): Promise<{ rejected: boolean }> {
  const data = (await runCreditRpc("reject_pending_purchase", () =>
    client.rpc("reject_pending_purchase", {
      p_purchase_id: input.purchaseId,
      p_payment_id: input.paymentId,
      p_status_detail: input.statusDetail,
    }))) as RejectPayload | null;
  return { rejected: data?.rejected === true };
}
