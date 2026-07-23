// Pure decision logic for the Stripe webhook, isolated from the HTTP handler so
// it can be unit-tested without running Deno / the Stripe SDK.

export interface CheckoutGrant {
  purchaseId: string;
  paymentId: string;
}

export interface CheckoutFailure {
  purchaseId: string;
}

// Events that mean "the customer paid". Card settles inside
// checkout.session.completed; Pix is a delayed-notification method, so its
// completed event arrives unpaid and the money is only confirmed later, in
// checkout.session.async_payment_succeeded.
const GRANT_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
];

// Events that mean "this pending purchase will never be paid" — a Pix that the
// customer never scanned, or one the bank declined.
const FAILURE_EVENTS = [
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
];

interface StripeCheckoutSession {
  client_reference_id?: string | null;
  payment_status?: string | null;
  payment_intent?: string | null;
  id?: string | null;
}

interface StripeEventLike {
  type?: string;
  data?: { object?: StripeCheckoutSession };
}

// Given a Stripe event, returns the purchase + payment ids to grant credits for,
// or null when the event must be ignored (wrong type, unpaid, or missing fields).
// payment_id stores the PaymentIntent id, falling back to the Checkout Session id.
export function extractCheckoutGrant(event: StripeEventLike): CheckoutGrant | null {
  if (!GRANT_EVENTS.includes(event.type ?? "")) return null;

  const session = event.data?.object;
  if (!session) return null;
  // The gate that keeps Pix honest: `completed` fires when the QR code is shown,
  // long before any money moves, and carries payment_status "unpaid".
  if (session.payment_status !== "paid") return null;

  const purchaseId = session.client_reference_id;
  if (!purchaseId) return null;

  const paymentId = session.payment_intent ?? session.id;
  if (!paymentId) return null;

  return { purchaseId, paymentId };
}

// Given a Stripe event, returns the purchase to close out as rejected, or null
// when the event is not a terminal failure. No payment id is needed — nothing
// was charged, so the purchase is simply taken out of the pending state.
export function extractCheckoutFailure(event: StripeEventLike): CheckoutFailure | null {
  if (!FAILURE_EVENTS.includes(event.type ?? "")) return null;

  const purchaseId = event.data?.object?.client_reference_id;
  if (!purchaseId) return null;

  return { purchaseId };
}
