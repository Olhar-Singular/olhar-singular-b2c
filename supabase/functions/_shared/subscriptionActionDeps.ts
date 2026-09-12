// Wiring of SubscriptionActionDeps over Supabase + Mercado Pago, shared by
// cancel-subscription and update-subscription-card. No decisions here (those
// live in subscriptionActions.ts); the tests pin the RPC names/params and the
// MP endpoint so a typo cannot silently break a cancel.

import type { SubscriptionActionDeps } from "./subscriptionActions.ts";

// Structural slice of supabase-js so the builder is testable with a fake.
export interface SubscriptionAdminClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        in(column: string, values: string[]): { maybeSingle(): PromiseLike<{ data: unknown; error?: { message: string } | null }> };
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }>;
    };
  };
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export function buildSubscriptionActionDeps(
  admin: SubscriptionAdminClient,
  mpAccessToken: string,
  fetchFn: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): SubscriptionActionDeps {
  const mpHeaders = { Authorization: `Bearer ${mpAccessToken}`, "Content-Type": "application/json" };
  return {
    findLiveSubscription: async (userId) => {
      const { data, error } = await admin
        .from("subscriptions")
        .select("id, mp_preapproval_id, status")
        .eq("user_id", userId)
        .in("status", ["authorized", "past_due", "paused"])
        .maybeSingle();
      // A read failure must not read as "no subscription" (404) while the
      // card keeps being charged: fail the request so the user retries.
      if (error) throw new Error(`subscriptions lookup failed: ${error.message}`);
      return data as Awaited<ReturnType<SubscriptionActionDeps["findLiveSubscription"]>>;
    },
    putPreapproval: async (preapprovalId, body) => {
      const resp = await fetchFn(`https://api.mercadopago.com/preapproval/${encodeURIComponent(preapprovalId)}`, {
        method: "PUT",
        headers: mpHeaders,
        body: JSON.stringify(body),
      });
      const json = await resp.json().catch(() => ({}));
      return { ok: resp.ok, status: resp.status, json };
    },
    cancelLocal: async (subscriptionId) => {
      const { data, error } = await admin.rpc("cancel_subscription_local", {
        p_subscription_id: subscriptionId,
        p_cancelled_at: now().toISOString(),
      });
      if (error) throw new Error(`cancel_subscription_local failed: ${error.message}`);
      return data;
    },
    updateCard: async ({ subscriptionId, cardBrand, cardLastFour }) => {
      const patch: Record<string, string> = {};
      if (cardBrand) patch.card_brand = cardBrand;
      if (cardLastFour) patch.card_last_four = cardLastFour;
      if (Object.keys(patch).length === 0) return;
      const { error } = await admin.from("subscriptions").update(patch).eq("id", subscriptionId);
      if (error) throw new Error(`subscriptions card update failed: ${error.message}`);
    },
    log: (message, ...args) => console.warn(message, ...args),
  };
}
