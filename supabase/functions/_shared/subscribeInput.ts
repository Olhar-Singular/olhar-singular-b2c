// Request validation for the subscribe edge function, kept pure so the accepted
// contract ({ planSlug, card, cardLastFour?, attribution? }) is unit-tested.

import { parseCardFormData, type CardFormData } from "./mpCardPayment.ts";

export type SubscribeRequest =
  | {
      ok: true;
      planSlug: string;
      card: CardFormData;
      cardLastFour: string | null;
      attribution: Record<string, unknown> | undefined;
    }
  | { ok: false; error: "invalid_body" | "invalid_plan" | "invalid_card" | "installments_not_allowed" };

const SLUG_RE = /^[a-z0-9-]{1,40}$/;
const LAST_FOUR_RE = /^[0-9]{4}$/;

export function parseSubscribeInput(body: unknown): SubscribeRequest {
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_body" };
  const { planSlug, card, cardLastFour, attribution } = body as Record<string, unknown>;

  if (typeof planSlug !== "string" || !SLUG_RE.test(planSlug)) return { ok: false, error: "invalid_plan" };

  const parsed = parseCardFormData(card);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  return {
    ok: true,
    planSlug,
    card: parsed.card,
    cardLastFour: typeof cardLastFour === "string" && LAST_FOUR_RE.test(cardLastFour) ? cardLastFour : null,
    attribution:
      typeof attribution === "object" && attribution !== null && !Array.isArray(attribution)
        ? (attribution as Record<string, unknown>)
        : undefined,
  };
}
