// Pure decision logic for the Stripe webhook, isolated from the HTTP handler so
// it can be unit-tested without running Deno / the Stripe SDK.

export interface CheckoutGrant {
  purchaseId: string;
  paymentId: string;
}

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
  if (event.type !== "checkout.session.completed") return null;

  const session = event.data?.object;
  if (!session) return null;
  if (session.payment_status !== "paid") return null;

  const purchaseId = session.client_reference_id;
  if (!purchaseId) return null;

  const paymentId = session.payment_intent ?? session.id;
  if (!paymentId) return null;

  return { purchaseId, paymentId };
}
