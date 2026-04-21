import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Validates MP webhook HMAC signature.
// MP sends: x-signature: ts=<timestamp>,v1=<hmac>
// Message format: id:<data_id>;request-date:<ts>;
async function validateSignature(
  req: Request,
  dataId: string,
  secret: string
): Promise<boolean> {
  const sigHeader = req.headers.get("x-signature");
  if (!sigHeader) return false;

  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => p.split("=") as [string, string])
  );
  const ts   = parts["ts"];
  const v1   = parts["v1"];
  if (!ts || !v1) return false;

  const message = `id:${dataId};request-date:${ts};`;
  const keyData = new TextEncoder().encode(secret);
  const msgData = new TextEncoder().encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const sigHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return sigHex === v1;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mpToken      = Deno.env.get("MP_ACCESS_TOKEN")!;
    const webhookSecret = Deno.env.get("MP_WEBHOOK_SECRET") ?? "";

    const body = await req.json();
    const { type, data } = body as { type?: string; data?: { id?: string } };

    // Only process payment notifications
    if (type !== "payment" || !data?.id) {
      return json({ received: true });
    }

    const paymentId = String(data.id);

    // Validate signature when secret is configured
    if (webhookSecret) {
      const valid = await validateSignature(req, paymentId, webhookSecret);
      if (!valid) {
        console.error("mp-webhook: invalid signature");
        return json({ error: "Assinatura inválida." }, 401);
      }
    }

    // Fetch full payment details from MP
    const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });

    if (!mpResp.ok) {
      console.error("mp-webhook: failed to fetch payment", mpResp.status);
      return json({ error: "Erro ao buscar pagamento." }, 502);
    }

    const payment = await mpResp.json();

    if (payment.status !== "approved") {
      // Not approved yet — acknowledge without action
      return json({ received: true });
    }

    const purchaseId: string | undefined = payment.external_reference;
    if (!purchaseId) {
      console.error("mp-webhook: missing external_reference in payment", paymentId);
      return json({ error: "external_reference ausente." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Atomically mark purchase as approved; skip if already processed (idempotency)
    const { data: updated, error: updateError } = await admin
      .from("credit_purchases")
      .update({ status: "approved", payment_id: paymentId })
      .eq("id", purchaseId)
      .eq("status", "pending")
      .select("user_id, credits_granted")
      .maybeSingle();

    if (updateError) {
      console.error("mp-webhook: update credit_purchases:", updateError);
      return json({ error: "Erro interno." }, 500);
    }

    if (!updated) {
      // Already processed — safe to acknowledge
      return json({ received: true });
    }

    // Grant credits atomically via RPC
    const { data: grantResult, error: grantError } = await admin.rpc("grant_credits", {
      p_user_id:    updated.user_id,
      p_amount:     updated.credits_granted,
      p_type:       "purchase",
      p_payment_id: paymentId,
      p_ref_id:     purchaseId,
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
