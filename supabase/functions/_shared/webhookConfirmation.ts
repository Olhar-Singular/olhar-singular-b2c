// The contract confirmation (subscriptionEmails.ts) when the subscription went
// live through the WEBHOOK, not synchronously at the checkout:
//   - 'activated'   (sync_subscription_status): the row was pending at the
//                   checkout (card still being validated) and MP has now
//                   authorized it. A replay returns 'unchanged'.
//   - 'reactivated' (renew_subscription): money landed on a row that was not
//                   live (pending, rejected or cancelled) and reopened it. The
//                   customer is charged today, so it is a new contract to
//                   confirm; the grant is claimed once per invoice, a replay
//                   returns 'already_processed'.
// Every other result either means the row was already live at the checkout
// (the e-mail went out then) or that nothing was contracted. Decreto 7.962
// art. 4 III; decision of 2026-10-14 (lote 2d).

import type { SendEmailResult } from "./email.ts";
import type { WebhookOutcome } from "./subscriptionActions.ts";
import type { SubscriptionConfirmationInput } from "./subscriptionEmails.ts";

export const CONFIRMATION_RESULTS: readonly string[] = ["activated", "reactivated"];

/** The subscription whose contract the webhook just closed, or null. */
export function subscriptionToConfirm(outcome: WebhookOutcome): string | null {
  if (!outcome.handled) return null;
  return CONFIRMATION_RESULTS.includes(String(outcome.result)) ? outcome.subscriptionId : null;
}

/** What the glue reads for the e-mail: the subscription, its plan, the account and the profile. */
export interface WebhookSubscriptionRaw {
  /** auth.users.email: the official channel (Termos 16.1); null when the account could not be read. */
  account_email: string | null;
  /** The card's payer_email, used only when the account e-mail is unavailable. */
  payer_email: string;
  trial_ends_at: string | null;
  /** On a reactivation renew_subscription writes COALESCE(debit_date, now()) here: the real contract date. */
  current_period_start: string | null;
  plan: { name: string; price_brl: number | string; monthly_credits: number } | null;
  profile: { full_name: string | null; terms_version: string | null } | null;
}

export interface WebhookConfirmationDeps {
  loadSubscription(subscriptionId: string): Promise<WebhookSubscriptionRaw | null>;
  /** sendSubscriptionConfirmation bound to the e-mail deps. */
  send(input: SubscriptionConfirmationInput & { to: string }): Promise<SendEmailResult>;
  log(message: string, ...args: unknown[]): void;
  appUrl: string;
  now?: () => Date;
}

export type WebhookConfirmationOutcome = "skipped" | "sent" | "failed" | "not_found";

/** Never throws: it runs in the background behind the webhook's answer. Logs name the subscription, never the addressee. */
export async function sendConfirmationAfterWebhook(outcome: WebhookOutcome, deps: WebhookConfirmationDeps): Promise<WebhookConfirmationOutcome> {
  const subscriptionId = subscriptionToConfirm(outcome);
  if (!subscriptionId) return "skipped";

  try {
    const row = await deps.loadSubscription(subscriptionId);
    if (!row || !row.plan) {
      deps.log("mp-webhook: confirmation e-mail skipped, subscription or plan not found", subscriptionId);
      return "not_found";
    }
    const now = (deps.now ?? (() => new Date()))();
    const reactivated = outcome.handled && outcome.result === "reactivated";
    // A reactivation charges whatever the row's trial history was; its contract
    // date is the debit the RPC recorded, not the moment the webhook arrived.
    const trialEndsAt = !reactivated && row.trial_ends_at ? new Date(row.trial_ends_at) : null;
    const chargedAt = reactivated && row.current_period_start ? new Date(row.current_period_start) : now;
    const sent = await deps.send({
      to: row.account_email ?? row.payer_email,
      fullName: row.profile?.full_name ?? null,
      planName: row.plan.name,
      priceBrl: Number(row.plan.price_brl),
      monthlyCredits: row.plan.monthly_credits,
      trial: trialEndsAt !== null,
      trialEndsAt,
      chargedAt,
      termsVersion: row.profile?.terms_version ?? null,
      appUrl: deps.appUrl,
    });
    if (!sent.ok) {
      deps.log("mp-webhook: confirmation e-mail not sent", subscriptionId, sent.reason);
      return "failed";
    }
    deps.log("mp-webhook: confirmation e-mail sent", subscriptionId, sent.id);
    return "sent";
  } catch (e) {
    deps.log("mp-webhook: confirmation e-mail failed", subscriptionId, e instanceof Error ? e.name : typeof e);
    return "failed";
  }
}
