// Pure decision logic for the Mercado Pago webhook, isolated from the HTTP
// handler so it can be unit-tested without Deno or a live MP call. Mirrors
// stripeEvents.ts: the webhook grants credit only for a confirmed payment and
// closes out the purchase when the payment terminally fails.

export interface MpPurchaseRef {
  purchaseId: string;
}

interface MpNotification {
  type?: string;
  data?: { id?: string | number } | null;
}

// MP pings the webhook for many topics; only "payment" carries a payment id we
// can look up. Returns the id as a string (MP sends it as string or number).
export function parsePaymentNotification(body: MpNotification): string | null {
  if (body.type !== "payment") return null;
  const id = body.data?.id;
  if (id === undefined || id === null || id === "") return null;
  return String(id);
}

interface MpPayment {
  status?: string;
  external_reference?: string | null;
}

// A paid Pix. external_reference is our credit_purchases.id, set when the
// preference was created; without it there is nothing to credit.
export function extractApprovedGrant(payment: MpPayment): MpPurchaseRef | null {
  if (payment.status !== "approved") return null;
  const purchaseId = payment.external_reference;
  if (!purchaseId) return null;
  return { purchaseId };
}

// A Pix that will never be paid — declined or expired — so the pending purchase
// can stop looking payable in the user's history.
const TERMINAL_FAILURE = ["rejected", "cancelled"];

export function extractRejectedPurchase(payment: MpPayment): MpPurchaseRef | null {
  if (!TERMINAL_FAILURE.includes(payment.status ?? "")) return null;
  const purchaseId = payment.external_reference;
  if (!purchaseId) return null;
  return { purchaseId };
}
