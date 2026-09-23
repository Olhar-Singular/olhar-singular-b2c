// Request validation for the subscribe edge function, kept pure so the accepted
// contract ({ planSlug, card, cardLastFour?, attribution?, trial? }) is unit-tested.

import { parseCardFormData, type CardFormData } from "./mpCardPayment.ts";

export type SubscribeRequest =
  | {
      ok: true;
      planSlug: string;
      card: CardFormData;
      cardLastFour: string | null;
      attribution: Record<string, unknown> | undefined;
      /** Trial with card (anonymous funnel): the server picks the plan, planSlug is ignored. */
      trial: boolean;
    }
  | { ok: false; error: "invalid_body" | "invalid_plan" | "invalid_card" | "installments_not_allowed" };

const SLUG_RE = /^[a-z0-9-]{1,40}$/;
const LAST_FOUR_RE = /^[0-9]{4}$/;
const CONSENT_KEYS = ["analytics_storage", "ad_storage", "ad_user_data", "ad_personalization"];
const ATTRIBUTION_MAX_KEYS = 20;

// Attribution is client-asserted (utm, referrer, consent flags). Keep it small
// and shaped: only scalar fields, and a consent block that is exactly the four
// Consent Mode flags with granted|denied, otherwise the block is dropped (a
// scripted caller cannot smuggle "granted" as anything but a boolean-ish flag).
export function sanitizeAttribution(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, ATTRIBUTION_MAX_KEYS)) {
    if (key === "consent") {
      if (typeof raw !== "object" || raw === null) continue;
      const consent: Record<string, string> = {};
      const ok = CONSENT_KEYS.every((k) => {
        const v = (raw as Record<string, unknown>)[k];
        if (v !== "granted" && v !== "denied") return false;
        consent[k] = v;
        return true;
      });
      if (ok) out.consent = consent;
      continue;
    }
    if (typeof raw === "string") out[key] = raw.slice(0, 200);
    else if (typeof raw === "number" || typeof raw === "boolean") out[key] = raw;
  }
  return out;
}

export function parseSubscribeInput(body: unknown): SubscribeRequest {
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_body" };
  const { planSlug, card, cardLastFour, attribution, trial } = body as Record<string, unknown>;

  if (typeof planSlug !== "string" || !SLUG_RE.test(planSlug)) return { ok: false, error: "invalid_plan" };

  const parsed = parseCardFormData(card);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  return {
    ok: true,
    planSlug,
    card: parsed.card,
    cardLastFour: typeof cardLastFour === "string" && LAST_FOUR_RE.test(cardLastFour) ? cardLastFour : null,
    attribution: sanitizeAttribution(attribution),
    trial: trial === true,
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
