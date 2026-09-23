// Cancel / change card / webhook routing for subscriptions, with dependencies
// injected so the decisions are unit-tested away from Deno and Supabase.
//
// Cancelling talks to Mercado Pago FIRST: if the provider refuses, we must not
// mark the row cancelled locally while the card keeps being charged. Credits of
// the paid period stay until plan_period_end (lazy expiry, decision 20).

import { interpretAuthorizedPayment, type AuthorizedPaymentLike, type InvoiceForRpc, type WebhookTopic } from "./mpPreapproval.ts";

export interface LiveSubscription {
  id: string;
  mp_preapproval_id: string | null;
  status: string;
}

export interface SubscriptionActionDeps {
  findLiveSubscription(userId: string): Promise<LiveSubscription | null>;
  putPreapproval(preapprovalId: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }>;
  cancelLocal(subscriptionId: string): Promise<unknown>;
  updateCard(input: { subscriptionId: string; cardBrand: string | null; cardLastFour: string | null }): Promise<void>;
  log(message: string, ...args: unknown[]): void;
}

export type ActionResult =
  | { ok: true; subscriptionId: string }
  | { ok: false; error: "no_subscription" | "provider_error"; httpStatus: number };

export async function runCancelSubscription(
  input: { userId: string },
  deps: SubscriptionActionDeps,
): Promise<ActionResult> {
  const sub = await deps.findLiveSubscription(input.userId);
  if (!sub) return { ok: false, error: "no_subscription", httpStatus: 404 };

  if (sub.mp_preapproval_id) {
    const resp = await deps.putPreapproval(sub.mp_preapproval_id, { status: "cancelled" });
    if (!resp.ok) {
      deps.log("cancel-subscription: MP refused", resp.status, resp.json?.message);
      return { ok: false, error: "provider_error", httpStatus: 502 };
    }
  }

  await deps.cancelLocal(sub.id);
  return { ok: true, subscriptionId: sub.id };
}

export async function runUpdateSubscriptionCard(
  input: { userId: string; cardToken: string; cardLastFour: string | null },
  deps: SubscriptionActionDeps,
): Promise<ActionResult> {
  const sub = await deps.findLiveSubscription(input.userId);
  if (!sub || !sub.mp_preapproval_id) return { ok: false, error: "no_subscription", httpStatus: 404 };

  const resp = await deps.putPreapproval(sub.mp_preapproval_id, { card_token_id: input.cardToken });
  if (!resp.ok) {
    deps.log("update-subscription-card: MP refused", resp.status, resp.json?.message);
    return { ok: false, error: "provider_error", httpStatus: 502 };
  }

  const brand = typeof resp.json?.payment_method_id === "string" ? resp.json.payment_method_id : null;
  await deps.updateCard({ subscriptionId: sub.id, cardBrand: brand, cardLastFour: input.cardLastFour });
  return { ok: true, subscriptionId: sub.id };
}

// ── Webhook ──────────────────────────────────────────────────────────────────

export interface PreapprovalLikeRead {
  id?: string | number;
  status?: string;
  external_reference?: string | null;
  next_payment_date?: string | null;
}

export interface SubscriptionWebhookDeps {
  fetchPreapproval(id: string): Promise<PreapprovalLikeRead | null>;
  fetchAuthorizedPayment(id: string): Promise<AuthorizedPaymentLike | null>;
  findSubscriptionByPreapproval(preapprovalId: string): Promise<{ id: string } | null>;
  syncStatus(input: { subscriptionId: string; preapprovalId: string; mpStatus: string; nextPaymentDate: string | null }): Promise<unknown>;
  renew(subscriptionId: string, invoice: InvoiceForRpc): Promise<unknown>;
  /** PUT /preapproval/{id} { status: 'cancelled' }; best effort. */
  cancelPreapproval(preapprovalId: string): Promise<void>;
  log(message: string, ...args: unknown[]): void;
}

export type WebhookOutcome =
  | { handled: true; result: unknown; subscriptionId: string }
  | { handled: false; reason: "provider_unavailable" | "unknown_subscription" | "invalid_payload" };

// Money (or an authorization) landed on a row that cannot be live: the
// preapproval at MP would keep charging with no subscription behind it.
const ORPHAN_RESULTS = ["duplicate_live_subscription", "paid_while_closed"];

async function closeOrphan(result: unknown, preapprovalId: string | null, subscriptionId: string, deps: SubscriptionWebhookDeps): Promise<void> {
  if (!ORPHAN_RESULTS.includes(String(result))) return;
  deps.log("mp-webhook: ALERT orphan preapproval, cancelling at MP", { result, subscriptionId, preapprovalId });
  if (!preapprovalId) return;
  try {
    await deps.cancelPreapproval(preapprovalId);
  } catch (e) {
    deps.log("mp-webhook: ALERT could not cancel orphan preapproval", preapprovalId, e);
  }
}

// An external refund/chargeback (MP panel, acquirer) already zeroed the plan
// bucket and cancelled the subscription locally (renew_subscription ->
// confirm_refund); the preapproval at MP must stop charging too, best effort.
async function cancelAfterExternalRefund(result: unknown, preapprovalId: string | null, subscriptionId: string, deps: SubscriptionWebhookDeps): Promise<void> {
  if (String(result) !== "refunded_externally") return;
  if (!preapprovalId) return;
  try {
    await deps.cancelPreapproval(preapprovalId);
    deps.log("mp-webhook: preapproval cancelled after an external refund", { subscriptionId, preapprovalId });
  } catch (e) {
    deps.log("mp-webhook: ALERT could not cancel the preapproval after an external refund", preapprovalId, e);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveSubscription(
  externalReference: string | null | undefined,
  preapprovalId: string | null | undefined,
  deps: SubscriptionWebhookDeps,
): Promise<string | null> {
  if (externalReference && UUID_RE.test(externalReference)) return externalReference.toLowerCase();
  if (preapprovalId) {
    const found = await deps.findSubscriptionByPreapproval(preapprovalId);
    if (found) return found.id;
  }
  return null;
}

// The notification carries only an id; status and our reference live on the
// object itself, fetched authoritatively from MP (same trust model as payment).
export async function handleSubscriptionWebhook(
  event: { topic: Exclude<WebhookTopic, "payment">; id: string },
  deps: SubscriptionWebhookDeps,
): Promise<WebhookOutcome> {
  if (event.topic === "subscription_preapproval") {
    const pre = await deps.fetchPreapproval(event.id);
    if (!pre) return { handled: false, reason: "provider_unavailable" };
    const preapprovalId = String(pre.id ?? event.id);
    const subscriptionId = await resolveSubscription(pre.external_reference, preapprovalId, deps);
    if (!subscriptionId) {
      deps.log("mp-webhook: preapproval without a known subscription", { id: event.id, external_reference: pre.external_reference ?? null, status: pre.status ?? null });
      return { handled: false, reason: "unknown_subscription" };
    }
    const result = await deps.syncStatus({
      subscriptionId,
      preapprovalId,
      mpStatus: pre.status ?? "unknown",
      nextPaymentDate: pre.next_payment_date ?? null,
    });
    await closeOrphan(result, preapprovalId, subscriptionId, deps);
    return { handled: true, result, subscriptionId };
  }

  const ap = await deps.fetchAuthorizedPayment(event.id);
  if (!ap) return { handled: false, reason: "provider_unavailable" };
  const shaped = interpretAuthorizedPayment(ap);
  if (!shaped) {
    deps.log("mp-webhook: authorized_payment without id or reference", { id: event.id });
    return { handled: false, reason: "invalid_payload" };
  }
  const subscriptionId = await resolveSubscription(shaped.subscriptionId, shaped.preapprovalId, deps);
  if (!subscriptionId) {
    deps.log("mp-webhook: ALERT charge without a known subscription", { id: event.id, preapproval_id: shaped.preapprovalId, external_reference: shaped.subscriptionId, payment_status: shaped.invoice.payment_status });
    return { handled: false, reason: "unknown_subscription" };
  }
  const result = await deps.renew(subscriptionId, shaped.invoice);
  await closeOrphan(result, shaped.preapprovalId, subscriptionId, deps);
  await cancelAfterExternalRefund(result, shaped.preapprovalId, subscriptionId, deps);
  return { handled: true, result, subscriptionId };
}
