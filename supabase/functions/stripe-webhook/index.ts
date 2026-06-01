import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { extractCheckoutGrant } from "../_shared/stripeEvents.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
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
    const stripeKey     = Deno.env.get("STRIPE_SECRET_KEY")!;
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Verify the event signature against the raw request body.
    const signature = req.headers.get("stripe-signature");
    const rawBody = await req.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature ?? "",
        webhookSecret,
        undefined,
        Stripe.createSubtleCryptoProvider(),
      );
    } catch (err) {
      console.error("stripe-webhook: signature verification failed", err);
      return json({ error: "Assinatura inválida." }, 401);
    }

    // Only paid checkout.session.completed events yield a grant; ignore the rest.
    const grant = extractCheckoutGrant(event as unknown as Record<string, unknown>);
    if (!grant) {
      return json({ received: true });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Atomically mark purchase as approved; skip if already processed (idempotency)
    const { data: updated, error: updateError } = await admin
      .from("credit_purchases")
      .update({ status: "approved", payment_id: grant.paymentId })
      .eq("id", grant.purchaseId)
      .eq("status", "pending")
      .select("user_id, credits_granted")
      .maybeSingle();

    if (updateError) {
      console.error("stripe-webhook: update credit_purchases:", updateError);
      return json({ error: "Erro interno." }, 500);
    }

    if (!updated) {
      // Already processed (or unknown purchase) — safe to acknowledge
      return json({ received: true });
    }

    // Grant credits atomically via RPC
    const { data: grantResult, error: grantError } = await admin.rpc("grant_credits", {
      p_user_id:    updated.user_id,
      p_amount:     updated.credits_granted,
      p_type:       "purchase",
      p_payment_id: grant.paymentId,
      p_ref_id:     grant.purchaseId,
    });

    if (grantError) {
      console.error("stripe-webhook: grant_credits error:", grantError);
      return json({ error: "Erro ao conceder créditos." }, 500);
    }

    if (grantResult?.success === false) {
      console.error("stripe-webhook: grant_credits failed:", grantResult);
      return json({ error: "Falha ao conceder créditos." }, 500);
    }

    return json({ received: true, credits_granted: updated.credits_granted });
  } catch (e) {
    console.error("stripe-webhook error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido." }, 500);
  }
});
