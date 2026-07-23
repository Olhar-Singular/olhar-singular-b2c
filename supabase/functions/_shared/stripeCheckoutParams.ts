// Pure builder for the Stripe Checkout Session payload, isolated from the HTTP
// handler so the card/Pix branching can be unit-tested without the Stripe SDK.

import type { CreditPackage } from "./creditPackages.ts";

export type CheckoutMethod = "card" | "pix";

// How long the Pix QR code stays payable. Stripe defaults to 4h (max 14 days);
// one hour is enough to open a banking app without leaving purchases pending
// half a day. Below this, the async_payment_failed webhook marks it rejected.
export const PIX_EXPIRES_AFTER_SECONDS = 3600;

const METHODS: readonly CheckoutMethod[] = ["card", "pix"];

// Normalizes the `method` field of the checkout request. Absent means card, so
// older clients keep working; anything unrecognized returns null (→ HTTP 400)
// instead of silently charging through the wrong rail.
export function parseCheckoutMethod(raw: unknown): CheckoutMethod | null {
  if (raw === undefined || raw === null) return "card";
  return METHODS.includes(raw as CheckoutMethod) ? (raw as CheckoutMethod) : null;
}

export interface CheckoutSessionInput {
  pkg: CreditPackage;
  method: CheckoutMethod;
  purchaseId: string;
  userId: string;
  email?: string;
  appUrl: string;
}

// Builds the object handed to stripe.checkout.sessions.create. Pix is a
// delayed-notification method: the session is created the same way, but it needs
// an explicit expiry and a success url the landing page can tell apart, since
// credits only land once the async webhook confirms the payment.
export function buildCheckoutSessionParams(
  input: CheckoutSessionInput,
): Record<string, unknown> {
  const { pkg, method, purchaseId, userId, email, appUrl } = input;
  const isPix = method === "pix";

  return {
    mode: "payment",
    payment_method_types: [method],
    ...(isPix
      ? { payment_method_options: { pix: { expires_after_seconds: PIX_EXPIRES_AFTER_SECONDS } } }
      : {}),
    line_items: [
      {
        price_data: {
          currency: "brl",
          product_data: {
            name: `${pkg.credits} ${pkg.credits === 1 ? "crédito" : "créditos"} — Olhar Singular`,
          },
          unit_amount: Math.round(pkg.amountBrl * 100),
        },
        quantity: 1,
      },
    ],
    client_reference_id: purchaseId,
    ...(email ? { customer_email: email } : {}),
    success_url: `${appUrl}/creditos/sucesso${isPix ? "?metodo=pix" : ""}`,
    cancel_url: `${appUrl}/creditos`,
    metadata: {
      purchase_id: purchaseId,
      user_id: userId,
      credits: String(pkg.credits),
    },
  };
}
