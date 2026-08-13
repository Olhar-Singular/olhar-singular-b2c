import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  extractApprovedGrant,
  extractRejectedPurchase,
  parsePaymentNotification,
} from "../_shared/mpEvents.ts";
import { validateMpSignature } from "../_shared/mpSignature.ts";

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
    const mpToken       = Deno.env.get("ACCESS_TOKEN_MP")!;
    const webhookSecret = Deno.env.get("VERIFY_TOKEN_MP_PROD") ?? "";

    const body = await req.json();
    const paymentId = parsePaymentNotification(body);

    // Ignore non-payment topics (merchant_order, etc.).
    if (!paymentId) {
      return json({ received: true });
    }

    // Validate the HMAC signature when a secret is configured. The webhook mints
    // credit, so an unsigned/forged call must never reach grant_credits.
    if (webhookSecret) {
      const valid = await validateMpSignature(req.headers.get("x-signature"), paymentId, webhookSecret);
      if (!valid) {
        console.error("mp-webhook: invalid signature");
        return json({ error: "Assinatura inválida." }, 401);
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
      // Declined or expired Pix closes out the pending purchase. Scoped to
      // 'pending' so an already-approved purchase can never be downgraded.
      const failure = extractRejectedPurchase(payment);
      if (failure) {
        const { error: rejectError } = await admin
          .from("credit_purchases")
          .update({ status: "rejected", payment_id: paymentId })
          .eq("id", failure.purchaseId)
          .eq("status", "pending");
        if (rejectError) {
          console.error("mp-webhook: reject credit_purchases:", rejectError);
          return json({ error: "Erro interno." }, 500);
        }
      }
      // Still pending (in_process/pending) or unknown: acknowledge, wait for the next ping.
      return json({ received: true });
    }

    // Atomically mark purchase as approved; skip if already processed (idempotency)
    const { data: updated, error: updateError } = await admin
      .from("credit_purchases")
      .update({ status: "approved", payment_id: paymentId })
      .eq("id", grant.purchaseId)
      .eq("status", "pending")
      .select("user_id, credits_granted")
      .maybeSingle();

    if (updateError) {
      console.error("mp-webhook: update credit_purchases:", updateError);
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
      p_payment_id: paymentId,
      p_ref_id:     grant.purchaseId,
    });

    if (grantError) {
      console.error("mp-webhook: grant_credits error:", grantError);
      return json({ error: "Erro ao conceder créditos." }, 500);
    }

    if (grantResult?.success === false) {
      console.error("mp-webhook: grant_credits failed:", grantResult);
      return json({ error: "Falha ao conceder créditos." }, 500);
    }

    return json({ received: true, credits_granted: updated.credits_granted });
  } catch (e) {
    console.error("mp-webhook error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido." }, 500);
  }
});
