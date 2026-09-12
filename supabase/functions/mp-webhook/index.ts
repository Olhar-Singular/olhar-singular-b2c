import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  extractApprovedGrant,
  extractRejectedPurchase,
  parsePaymentNotification,
} from "../_shared/mpEvents.ts";
import { validateMpSignature } from "../_shared/mpSignature.ts";
import { approvePurchaseAndGrant, rejectPendingPurchase } from "../_shared/purchaseGrant.ts";
import { parseSubscriptionNotification } from "../_shared/mpPreapproval.ts";
import { handleSubscriptionWebhook, type SubscriptionWebhookDeps } from "../_shared/subscriptionActions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl   = Deno.env.get("SUPABASE_URL")!;
    const serviceKey    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Same production credential the payment was created with; the older
    // ACCESS_TOKEN_MP cannot read those payments back.
    const mpToken       = Deno.env.get("ACCESS_TOKEN_MP_PROD")!;
    const webhookSecret = Deno.env.get("VERIFY_TOKEN_MP_PROD") ?? "";

    const url = new URL(req.url);
    const body = await req.json();
    const queryId = url.searchParams.get("data.id");

    // Subscription topics: status mirror (subscription_preapproval) and monthly
    // charges (subscription_authorized_payment). Same trust model as payments:
    // the object is re-fetched from MP with our token, the ping is only a hint.
    const subEvent = parseSubscriptionNotification(body, queryId);
    if (subEvent.topic && subEvent.topic !== "payment" && subEvent.id) {
      const admin = createClient(supabaseUrl, serviceKey);
      const mpHeaders = { Authorization: `Bearer ${mpToken}` };
      const fetchJson = async (path: string) => {
        const resp = await fetch(`https://api.mercadopago.com${path}`, { headers: mpHeaders });
        if (!resp.ok) {
          console.error("mp-webhook: failed to fetch", path, resp.status);
          return null;
        }
        return await resp.json();
      };
      const deps: SubscriptionWebhookDeps = {
        fetchPreapproval: (id) => fetchJson(`/preapproval/${encodeURIComponent(id)}`),
        fetchAuthorizedPayment: (id) => fetchJson(`/authorized_payments/${encodeURIComponent(id)}`),
        findSubscriptionByPreapproval: async (preapprovalId) => {
          const { data, error } = await admin.from("subscriptions").select("id").eq("mp_preapproval_id", preapprovalId).maybeSingle();
          // A read failure must not be acknowledged as "unknown subscription"
          // (200): throwing yields a 500 and MP retries the notification.
          if (error) throw new Error(`subscriptions lookup failed: ${error.message}`);
          return data;
        },
        syncStatus: async (input) => {
          const { data, error } = await admin.rpc("sync_subscription_status", {
            p_subscription_id: input.subscriptionId,
            p_mp_preapproval_id: input.preapprovalId,
            p_mp_status: input.mpStatus,
            p_next_payment_date: input.nextPaymentDate,
          });
          if (error) throw new Error(`sync_subscription_status failed: ${error.message}`);
          return data?.result;
        },
        renew: async (subscriptionId, invoice) => {
          const { data, error } = await admin.rpc("renew_subscription", {
            p_subscription_id: subscriptionId,
            p_invoice: invoice,
          });
          if (error) throw new Error(`renew_subscription failed: ${error.message}`);
          return data?.result;
        },
        log: (message, ...args) => console.warn(message, ...args),
      };
      const outcome = await handleSubscriptionWebhook({ topic: subEvent.topic, id: subEvent.id }, deps);
      // provider_unavailable → 502 so MP retries; anything else is acknowledged.
      if (!outcome.handled && outcome.reason === "provider_unavailable") {
        return json({ error: "Erro ao buscar assinatura." }, 502);
      }
      return json({ received: true, ...(outcome.handled ? { result: outcome.result } : { ignored: outcome.reason }) });
    }

    // MP puts the id in the body AND as the query param data.id; the signature is
    // computed over the query one.
    const paymentId = parsePaymentNotification(body) ?? queryId;

    // Ignore non-payment topics (merchant_order, etc.).
    if (!paymentId) {
      return json({ received: true });
    }

    // The signature is validated for observability, NOT as the authorization: the
    // grant below re-fetches the payment from MP with our own token, which a
    // caller cannot forge. So an MP signature-format change logs a warning and
    // still processes, instead of blocking a paid credit (which is what happened
    // when the manifest drifted). A forged call can at worst re-trigger an
    // already-approved payment (idempotent) or a pending one (no-op).
    if (webhookSecret) {
      const valid = await validateMpSignature(
        req.headers.get("x-signature"),
        req.headers.get("x-request-id"),
        url.searchParams.get("data.id") ?? paymentId,
        webhookSecret,
      );
      if (!valid) {
        console.warn("mp-webhook: signature check failed; proceeding via authoritative re-fetch");
      }
    }

    // The notification only carries the id; the status and our external_reference
    // live on the payment itself, fetched authoritatively from MP.
    const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });

    if (!mpResp.ok) {
      console.error("mp-webhook: failed to fetch payment", mpResp.status);
      return json({ error: "Erro ao buscar pagamento." }, 502);
    }

    const payment = await mpResp.json();
    const admin = createClient(supabaseUrl, serviceKey);

    const grant = extractApprovedGrant(payment);
    if (!grant) {
      // Declined or expired payment closes out the pending purchase (never an
      // approved one: the RPC is scoped to 'pending') and keeps MP's reason.
      const failure = extractRejectedPurchase(payment);
      if (failure) {
        await rejectPendingPurchase(admin, {
          purchaseId: failure.purchaseId,
          paymentId,
          statusDetail: typeof payment.status_detail === "string" ? payment.status_detail : null,
        });
      }
      // Still pending (in_process/pending) or unknown: acknowledge, wait for the next ping.
      return json({ received: true });
    }

    // Claim + grant happen in one database transaction, so a crash here can
    // never leave the purchase approved without its credits, and a replay (or
    // the synchronous card checkout racing us) can never grant twice.
    const result = await approvePurchaseAndGrant(admin, {
      purchaseId: grant.purchaseId,
      paymentId,
    });

    if (!result.granted) {
      // Already processed (or unknown purchase): safe to acknowledge.
      return json({ received: true });
    }

    return json({ received: true, credits_granted: result.credits });
  } catch (e) {
    console.error("mp-webhook error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido." }, 500);
  }
});
