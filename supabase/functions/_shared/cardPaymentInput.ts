// Request validation for the create-card-payment edge function, kept pure so
// the accepted contract ({ packageId, card }) is unit-tested away from Deno.

import { parseCardFormData, type CardFormData } from "./mpCardPayment.ts";

export type CardPaymentRequest =
  | { ok: true; packageId: string; card: CardFormData }
  | { ok: false; error: "invalid_body" | "invalid_package" | "invalid_card" | "installments_not_allowed" };

export function parseCardPaymentRequest(body: unknown): CardPaymentRequest {
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_body" };
  const { packageId, card } = body as { packageId?: unknown; card?: unknown };

  if (typeof packageId !== "string" || !packageId) return { ok: false, error: "invalid_package" };

  const parsed = parseCardFormData(card);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  return { ok: true, packageId, card: parsed.card };
}
