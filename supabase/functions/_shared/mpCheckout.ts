// Pure builder for the Mercado Pago Checkout Pro preference (Pix only), isolated
// from the HTTP handler so it can be unit-tested without the MP API. Card flows
// go through Stripe; here every card/boleto type is excluded so the hosted page
// offers only Pix.

import type { CreditPackage } from "./creditPackages.ts";

export interface MpPreferenceInput {
  pkg: CreditPackage;
  purchaseId: string;
  email?: string;
  appUrl: string;
  notificationUrl: string;
}

export function buildMpPreference(input: MpPreferenceInput): Record<string, unknown> {
  const { pkg, purchaseId, email, appUrl, notificationUrl } = input;

  // MP rejects auto_return when the success url is not publicly reachable (e.g.
  // localhost in dev): "back_url.success must be defined". Only ask for the
  // auto-redirect on a real HTTPS domain; the webhook credits either way.
  const autoRedirect = appUrl.startsWith("https://");

  return {
    items: [
      {
        // Regular hyphen, not an em dash, per project pt-BR punctuation.
        title: `${pkg.credits} ${pkg.credits === 1 ? "crédito" : "créditos"} - Olhar Singular`,
        quantity: 1,
        unit_price: pkg.amountBrl,
        currency_id: "BRL",
      },
    ],
    ...(email ? { payer: { email } } : {}),
    back_urls: {
      // ?metodo=pix so CreditsSuccessPage promises settlement, not an instant balance.
      success: `${appUrl}/creditos/sucesso?metodo=pix`,
      failure: `${appUrl}/creditos`,
      pending: `${appUrl}/creditos`,
    },
    ...(autoRedirect ? { auto_return: "approved" } : {}),
    external_reference: purchaseId,
    notification_url: notificationUrl,
    payment_methods: {
      excluded_payment_types: [
        { id: "credit_card" },
        { id: "debit_card" },
        { id: "ticket" },
        { id: "atm" },
        { id: "prepaid_card" },
      ],
      installments: 1,
    },
  };
}
