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

export type UpdateCardRequest =
  | { ok: true; card: CardFormData; cardLastFour: string | null }
  | { ok: false; error: "invalid_body" | "invalid_card" | "installments_not_allowed" };

// { card, cardLastFour? }: the Brick tokenizes the new card exactly as it does
// for a purchase; only the token travels to MP.
export function parseUpdateCardInput(body: unknown): UpdateCardRequest {
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_body" };
  const { card, cardLastFour } = body as Record<string, unknown>;
  const parsed = parseCardFormData(card);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return {
    ok: true,
    card: parsed.card,
    cardLastFour: typeof cardLastFour === "string" && LAST_FOUR_RE.test(cardLastFour) ? cardLastFour : null,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cancel is self-service; a super-admin may pass { userId } to cancel on behalf
// of a user (support). An absent body cancels the caller's own subscription.
export function parseCancelInput(body: unknown): { ok: true; userId: string | null } | { ok: false; error: "invalid_body" } {
  if (body === null || body === undefined) return { ok: true, userId: null };
  if (typeof body !== "object") return { ok: false, error: "invalid_body" };
  const { userId } = body as Record<string, unknown>;
  if (userId === undefined || userId === null) return { ok: true, userId: null };
  if (typeof userId !== "string" || !UUID_RE.test(userId)) return { ok: false, error: "invalid_body" };
  return { ok: true, userId: userId.toLowerCase() };
}
