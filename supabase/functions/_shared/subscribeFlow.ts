// The subscribe flow with its dependencies injected, so the money-critical
// branching (plan validation, one live subscription, optimistic activation,
// pending, rejection, never-retry-the-POST) is unit-tested away from Deno and
// Supabase. subscribe/index.ts only builds `deps`.

import type { CardFormData } from "./mpCardPayment.ts";
import { buildPreapprovalBody, interpretPreapproval, type PlanLike } from "./mpPreapproval.ts";

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
}

export interface PreapprovalHttp {
  ok: boolean;
  status: number;
  json: Record<string, unknown>;
}

export interface SubscribeDeps {
  loadPlan(slug: string): Promise<PlanRow | null>;
  loadProfile(userId: string): Promise<{ access_kind: string; is_super_admin: boolean } | null>;
  findLiveSubscription(userId: string): Promise<{ id: string; status: string } | null>;
  /** Closes pending rows older than the grace window so a fresh attempt is possible. */
  expireStalePending(userId: string): Promise<void>;
  insertSubscription(row: {
    userId: string;
    planId: string;
    payerEmail: string;
    attribution: Record<string, unknown> | undefined;
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
  }): Promise<unknown>;
  markPending(input: { subscriptionId: string; preapprovalId: string; mpStatus: string }): Promise<void>;
  reject(input: { subscriptionId: string; detail: string }): Promise<void>;
  log(message: string, ...args: unknown[]): void;
}

export type SubscribeResult =
  | { ok: true; status: "authorized" | "pending"; subscriptionId: string }
  | { ok: true; status: "rejected"; subscriptionId: string; detail: string }
  | { ok: false; error: "invalid_plan" | "exempt_user" | "already_subscribed" | "profile_not_found"; httpStatus: number };

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

  const planRow = await deps.loadPlan(input.planSlug);
  if (!planRow || !planRow.active || (planRow.admin_only && !profile.is_super_admin)) {
    return { ok: false, error: "invalid_plan", httpStatus: 400 };
  }
  const plan = toPlanLike(planRow);

  if (await deps.findLiveSubscription(input.userId)) {
    return { ok: false, error: "already_subscribed", httpStatus: 409 };
  }

  await deps.expireStalePending(input.userId);

  const subscriptionId = await deps.insertSubscription({
    userId: input.userId,
    planId: plan.id,
    payerEmail: input.email,
    attribution: input.attribution,
  });

  const body = buildPreapprovalBody({
    plan,
    subscriptionId,
    payerEmail: input.email,
    cardToken: input.card.token,
    backUrl: input.backUrl,
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
      return { ok: true, status: "rejected", subscriptionId, detail: "network_error" };
    }
  }

  const outcome = interpretPreapproval(response as Record<string, unknown>);

  if (httpOk && outcome.status === "authorized" && outcome.preapprovalId) {
    await deps.activate({
      subscriptionId,
      preapprovalId: outcome.preapprovalId,
      // interpretPreapproval only reports "authorized" when MP said so.
      mpStatus: "authorized",
      nextPaymentDate: outcome.nextPaymentDate,
      cardBrand: outcome.cardBrand,
      cardLastFour: input.cardLastFour ?? null,
    });
    return { ok: true, status: "authorized", subscriptionId };
  }

  if (httpOk && outcome.status === "pending" && outcome.preapprovalId) {
    await deps.markPending({ subscriptionId, preapprovalId: outcome.preapprovalId, mpStatus: "pending" });
    return { ok: true, status: "pending", subscriptionId };
  }

  // interpretPreapproval always fills statusDetail on a rejection.
  const detail = outcome.statusDetail as string;
  await deps.reject({ subscriptionId, detail });
  return { ok: true, status: "rejected", subscriptionId, detail };
}
