// The subscribe flow with its dependencies injected, so the money-critical
// branching (plan validation, one live subscription, optimistic activation,
// pending, rejection, never-retry-the-POST) is unit-tested away from Deno and
// Supabase. subscribe/index.ts only builds `deps`.
//
// Trial with card: cheapest public plan, `trial_ends_at` on the row, `start_date` at MP.

import type { CardFormData } from "./mpCardPayment.ts";
import { buildPreapprovalBody, interpretPreapproval, trialEndDate, type PlanLike } from "./mpPreapproval.ts";

export interface PlanRow {
  id: string;
  slug: string;
  name: string;
  price_brl: number | string;
  monthly_credits: number;
  active: boolean;
  admin_only: boolean;
}

export interface SubscribeInput {
  userId: string;
  email: string;
  planSlug: string;
  card: CardFormData;
  cardLastFour?: string | null;
  backUrl: string;
  attribution?: Record<string, unknown>;
  /** Trial with card: the cheapest public plan, first charge in TRIAL_DAYS (decision 1). */
  trial?: boolean;
  /** Clock, injectable for tests; the wall clock otherwise. */
  now?: Date;
}

export interface PreapprovalHttp {
  ok: boolean;
  status: number;
  json: Record<string, unknown>;
}

export interface SubscribeDeps {
  loadPlan(slug: string): Promise<PlanRow | null>;
  /** The trial's plan is decided here, never by the client: cheapest active, not admin_only. */
  loadCheapestPublicPlan(): Promise<PlanRow | null>;
  loadProfile(userId: string): Promise<{ access_kind: string; is_super_admin: boolean } | null>;
  /** Live rows (authorized/past_due/paused) AND fresh pending attempts. */
  findLiveSubscription(userId: string): Promise<{ id: string; status: string } | null>;
  /** Closes pending rows older than the grace window so a fresh attempt is possible. */
  expireStalePending(userId: string): Promise<void>;
  insertSubscription(row: {
    userId: string;
    planId: string;
    payerEmail: string;
    attribution: Record<string, unknown> | undefined;
    /** ISO of the first charge for a trial; the row carries the intent (activate branches on it). */
    trialEndsAt: string | null;
  }): Promise<string>;
  postPreapproval(body: Record<string, unknown>, idempotencyKey: string): Promise<PreapprovalHttp>;
  /** GET /preapproval/search?external_reference= ; used only after a network failure. */
  searchPreapprovalByRef(subscriptionId: string): Promise<Record<string, unknown> | null>;
  activate(input: {
    subscriptionId: string;
    preapprovalId: string;
    mpStatus: string;
    nextPaymentDate: string | null;
    cardBrand: string | null;
    cardLastFour: string | null;
  }): Promise<{ success?: boolean; error?: string } | null | undefined>;
  /** PUT /preapproval/{id} { status: 'cancelled' }; best effort, used when the row could not be activated. */
  cancelPreapproval(preapprovalId: string): Promise<void>;
  markPending(input: { subscriptionId: string; preapprovalId: string; mpStatus: string }): Promise<void>;
  reject(input: { subscriptionId: string; detail: string }): Promise<void>;
  log(message: string, ...args: unknown[]): void;
}

interface ChosenPlan {
  /** The plan the server actually used (for a trial it is not the requested slug). */
  planSlug: string;
  priceBrl: number;
  /** Trial with card: ISO of the first charge. Absent on a paid-from-day-one attempt and on rejections. */
  trialEndsAt?: string;
}

export type SubscribeResult =
  | ({ ok: true; status: "authorized" | "pending"; subscriptionId: string } & ChosenPlan)
  | ({ ok: true; status: "rejected"; subscriptionId: string; detail: string } & ChosenPlan)
  | { ok: false; error: "invalid_plan" | "exempt_user" | "already_subscribed" | "attempt_in_progress" | "profile_not_found"; httpStatus: number };

function toPlanLike(row: PlanRow): PlanLike {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    priceBrl: Number(row.price_brl),
    monthlyCredits: row.monthly_credits,
    adminOnly: row.admin_only,
  };
}

export async function runSubscribe(input: SubscribeInput, deps: SubscribeDeps): Promise<SubscribeResult> {
  const profile = await deps.loadProfile(input.userId);
  if (!profile) return { ok: false, error: "profile_not_found", httpStatus: 404 };
  if (profile.access_kind === "exempt" && !profile.is_super_admin) {
    return { ok: false, error: "exempt_user", httpStatus: 409 };
  }

  const planRow = input.trial ? await deps.loadCheapestPublicPlan() : await deps.loadPlan(input.planSlug);
  if (!planRow || !planRow.active || (planRow.admin_only && !profile.is_super_admin)) {
    return { ok: false, error: "invalid_plan", httpStatus: 400 };
  }
  const plan = toPlanLike(planRow);
  const chosen: ChosenPlan = { planSlug: plan.slug, priceBrl: plan.priceBrl };
  // The trial's first charge: computed here (never by the client) and written on
  // the row before MP is called, so activation knows it is a trial whichever
  // path reaches it (synchronous authorized or the webhook).
  const trialEndsAt = input.trial ? trialEndDate(input.now ?? new Date()).toISOString() : null;
  const trialFields = trialEndsAt ? { trialEndsAt } : {};

  // Stale pending rows go first, so what findLiveSubscription returns is
  // either a live subscription or an attempt still in flight (double click,
  // or a card MP is still validating): both block a new POST /preapproval.
  await deps.expireStalePending(input.userId);
  const existing = await deps.findLiveSubscription(input.userId);
  if (existing) {
    return existing.status === "pending"
      ? { ok: false, error: "attempt_in_progress", httpStatus: 409 }
      : { ok: false, error: "already_subscribed", httpStatus: 409 };
  }

  const subscriptionId = await deps.insertSubscription({
    userId: input.userId,
    planId: plan.id,
    payerEmail: input.email,
    attribution: input.attribution,
    trialEndsAt,
  });

  const body = buildPreapprovalBody({
    plan,
    subscriptionId,
    payerEmail: input.email,
    cardToken: input.card.token,
    backUrl: input.backUrl,
    startDate: trialEndsAt ?? undefined,
  });

  let response: Record<string, unknown> | null = null;
  let httpOk = true;
  try {
    const http = await deps.postPreapproval(body, subscriptionId);
    httpOk = http.ok;
    response = http.json;
  } catch (e) {
    // Never repeat the POST: a timeout may have created the preapproval. Ask MP.
    deps.log("subscribe: preapproval request failed, looking up by reference", subscriptionId, e);
    response = await deps.searchPreapprovalByRef(subscriptionId);
    if (!response) {
      await deps.reject({ subscriptionId, detail: "network_error" });
      return { ok: true, status: "rejected", subscriptionId, detail: "network_error", ...chosen };
    }
  }

  const outcome = interpretPreapproval(response as Record<string, unknown>);

  if (httpOk && outcome.status === "authorized" && outcome.preapprovalId) {
    const activation = await deps.activate({
      subscriptionId,
      preapprovalId: outcome.preapprovalId,
      // interpretPreapproval only reports "authorized" when MP said so.
      mpStatus: "authorized",
      nextPaymentDate: outcome.nextPaymentDate,
      cardBrand: outcome.cardBrand,
      cardLastFour: input.cardLastFour ?? null,
    });
    if (activation && activation.success === false) {
      // The row could not go live (another live subscription won the race):
      // MP already holds an authorized preapproval, so cancel it there before
      // telling the user; the RPC has already marked the row rejected.
      const detail = activation.error ?? "activation_failed";
      deps.log("subscribe: activation refused, cancelling preapproval", subscriptionId, detail);
      try {
        await deps.cancelPreapproval(outcome.preapprovalId);
      } catch (e) {
        deps.log("subscribe: could not cancel the orphan preapproval", outcome.preapprovalId, e);
      }
      await deps.reject({ subscriptionId, detail });
      return { ok: true, status: "rejected", subscriptionId, detail, ...chosen };
    }
    return { ok: true, status: "authorized", subscriptionId, ...chosen, ...trialFields };
  }

  if (httpOk && outcome.status === "pending" && outcome.preapprovalId) {
    await deps.markPending({ subscriptionId, preapprovalId: outcome.preapprovalId, mpStatus: "pending" });
    return { ok: true, status: "pending", subscriptionId, ...chosen, ...trialFields };
  }

  // interpretPreapproval always fills statusDetail on a rejection.
  const detail = outcome.statusDetail as string;
  await deps.reject({ subscriptionId, detail });
  return { ok: true, status: "rejected", subscriptionId, detail, ...chosen };
}
