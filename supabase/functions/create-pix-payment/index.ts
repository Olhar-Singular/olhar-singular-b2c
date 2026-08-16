import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findPackage } from "../_shared/creditPackages.ts";
import { buildPixPaymentBody, extractPixQr } from "../_shared/mpPixPayment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Não autorizado." }, 401);
    }

    const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Direct /v1/payments needs the production credential; the older
    // ACCESS_TOKEN_MP is rejected there ("Unauthorized use of live credentials").
    const mpAccessToken   = Deno.env.get("ACCESS_TOKEN_MP_PROD")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return json({ error: "Não autorizado." }, 401);
    }

    const body = await req.json();
    const { credits, amountBrl } = body as { credits?: number; amountBrl?: number };

    // The R$1 TEST_PACKAGE is only purchasable by super-admins; owner-based RLS
    // lets the user client read its own profile.
    const { data: profile } = await userClient
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle();

    const pkg = findPackage(credits, amountBrl, { allowTest: profile?.is_super_admin === true });
    if (!pkg) {
      return json({ error: "Pacote inválido." }, 400);
    }

    // Insert pending purchase record via service_role (RLS blocks authenticated inserts)
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: purchase, error: insertError } = await admin
      .from("credit_purchases")
      .insert({
        user_id:         user.id,
        amount_brl:      pkg.amountBrl,
        credits_granted: pkg.credits,
        status:          "pending",
        provider:        "mercadopago",
        payment_method:  "pix",
      })
      .select("id")
      .single();

    if (insertError || !purchase) {
      console.error("insert credit_purchases:", insertError);
      return json({ error: "Erro ao criar registro de compra." }, 500);
    }

    // Checkout Transparente: MP answers with the QR code itself, so the buyer
    // pays from inside our page instead of being sent to the MP checkout (which
    // would demand a login). The purchase id doubles as the idempotency key —
    // one row, one charge, even if the request is retried.
    const mpResp = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization:       `Bearer ${mpAccessToken}`,
        "Content-Type":      "application/json",
        "X-Idempotency-Key": purchase.id,
      },
      body: JSON.stringify(
        buildPixPaymentBody({
          pkg,
          purchaseId:      purchase.id,
          email:           user.email,
          notificationUrl: `${supabaseUrl}/functions/v1/mp-webhook`,
        }),
      ),
    });

    const payment = mpResp.ok ? await mpResp.json() : null;
    const qr = payment ? extractPixQr(payment) : null;

    if (!qr) {
      if (!mpResp.ok) console.error("MP payments error:", mpResp.status, await mpResp.text());
      else console.error("MP payment without Pix QR:", payment?.id, payment?.status);
      // Close the row out so a failed attempt does not linger as payable.
      await admin
        .from("credit_purchases")
        .update({ status: "cancelled" })
        .eq("id", purchase.id)
        .eq("status", "pending");
      return json({ error: "Erro ao gerar o Pix. Tente novamente." }, 502);
    }

    // Store the MP payment id so the webhook (and support) can reconcile.
    const { error: paymentIdError } = await admin
      .from("credit_purchases")
      .update({ payment_id: qr.paymentId })
      .eq("id", purchase.id);
    if (paymentIdError) {
      // Not fatal: the webhook resolves the purchase by external_reference.
      console.error("create-pix-payment: store payment_id:", paymentIdError);
    }

    return json({
      qrCode:       qr.qrCode,
      qrCodeBase64: qr.qrCodeBase64,
      purchaseId:   purchase.id,
      ticketUrl:    qr.ticketUrl,
    });
  } catch (e) {
    console.error("create-pix-payment error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido." }, 500);
  }
});
