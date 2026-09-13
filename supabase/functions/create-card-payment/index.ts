import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { selectPackage, type CreditPackageRow } from "../_shared/creditPackages.ts";
import { parseCardPaymentRequest } from "../_shared/cardPaymentInput.ts";
import { buildCardPaymentBody, interpretCardPayment, maskPayer } from "../_shared/mpCardPayment.ts";
import { statusDetailMessage } from "../_shared/mpStatusDetail.ts";
import { approvePurchaseAndGrant, rejectPendingPurchase } from "../_shared/purchaseGrant.ts";
import { dispatchAnalytics, readAnalyticsConfig, sendAnalyticsEvents } from "../_shared/analyticsEvents.ts";

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

const INPUT_ERRORS: Record<string, string> = {
  invalid_body: "Requisição inválida.",
  invalid_package: "Pacote inválido.",
  invalid_card: "Dados do cartão inválidos. Tente de novo.",
  installments_not_allowed: "Parcelamento não disponível.",
};

// Extra credits paid with a card, inside our own page. The Card Payment Brick
// tokenized the card in the browser; here the package (and its price) comes
// from the table, the purchase row is created pending, and MP answers on the
// spot thanks to binary_mode. Approval and rejection go through the same
// database RPCs the webhook uses, so the two can race safely.
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
    const mpAccessToken   = Deno.env.get("ACCESS_TOKEN_MP_PROD")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user || !user.email) {
      return json({ error: "Não autorizado." }, 401);
    }

    const parsed = parseCardPaymentRequest(await req.json());
    if (!parsed.ok) {
      return json({ error: INPUT_ERRORS[parsed.error] }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const [{ data: profile }, { data: rows, error: rowsError }] = await Promise.all([
      userClient.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle(),
      admin.from("credit_packages").select("*").eq("id", parsed.packageId),
    ]);
    if (rowsError) {
      console.error("create-card-payment: read credit_packages:", rowsError);
      return json({ error: "Erro ao carregar o pacote." }, 500);
    }

    const pkg = selectPackage((rows ?? []) as CreditPackageRow[], parsed.packageId, {
      allowAdminOnly: profile?.is_super_admin === true,
    });
    if (!pkg) {
      return json({ error: "Pacote inválido." }, 400);
    }

    const { data: purchase, error: insertError } = await admin
      .from("credit_purchases")
      .insert({
        user_id:         user.id,
        amount_brl:      pkg.amountBrl,
        credits_granted: pkg.credits,
        status:          "pending",
        provider:        "mercadopago",
        payment_method:  "card",
      })
      .select("id")
      .single();

    if (insertError || !purchase) {
      console.error("create-card-payment: insert credit_purchases:", insertError);
      return json({ error: "Erro ao criar registro de compra." }, 500);
    }

    const mpBody = buildCardPaymentBody({
      pkg,
      purchaseId:      purchase.id,
      card:            parsed.card,
      email:           user.email,
      notificationUrl: `${supabaseUrl}/functions/v1/mp-webhook`,
    });

    // The purchase id doubles as the idempotency key: one row, one charge, even
    // if the request is retried.
    const mpResp = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization:       `Bearer ${mpAccessToken}`,
        "Content-Type":      "application/json",
        "X-Idempotency-Key": purchase.id,
      },
      body: JSON.stringify(mpBody),
    });

    if (!mpResp.ok) {
      const errorBody = await mpResp.json().catch(() => ({}));
      // Never log the token or the payer (e-mail, CPF); ids and MP's message only.
      console.error("create-card-payment: MP error", mpResp.status, maskPayer(errorBody), "purchase:", purchase.id);
      await rejectPendingPurchase(admin, {
        purchaseId: purchase.id,
        paymentId: null,
        statusDetail: "mp_request_failed",
      });
      return json({ error: "Não foi possível processar o cartão. Tente novamente." }, 502);
    }

    const outcome = interpretCardPayment(await mpResp.json());

    if (outcome.status === "approved") {
      const result = await approvePurchaseAndGrant(admin, {
        purchaseId: purchase.id,
        paymentId: outcome.paymentId,
      });
      if (result.granted) {
        // No-op without the analytics secrets; never fails the purchase.
        await dispatchAnalytics(sendAnalyticsEvents(
          [{ name: "purchase", eventId: purchase.id, userId: user.id, valueBrl: pkg.amountBrl, email: user.email, params: { package: pkg.id, credits: pkg.credits } }],
          readAnalyticsConfig(Deno.env),
        ));
      }
      return json({
        status:         "approved",
        purchaseId:     purchase.id,
        creditsGranted: result.granted ? result.credits : pkg.credits,
      });
    }

    if (outcome.status === "rejected") {
      await rejectPendingPurchase(admin, {
        purchaseId: purchase.id,
        paymentId: outcome.paymentId,
        statusDetail: outcome.statusDetail,
      });
      // A declined card is a result, not a request error: 200 with the reason.
      return json({
        status:       "rejected",
        purchaseId:   purchase.id,
        statusDetail: outcome.statusDetail,
        message:      statusDetailMessage(outcome.statusDetail),
      });
    }

    // Left pending by MP (should not happen with binary_mode): store the payment
    // id so the webhook can settle it, and let the client poll the purchase.
    if (outcome.paymentId) {
      const { error: paymentIdError } = await admin
        .from("credit_purchases")
        .update({ payment_id: outcome.paymentId })
        .eq("id", purchase.id)
        .eq("status", "pending");
      if (paymentIdError) {
        console.error("create-card-payment: store payment_id:", paymentIdError);
      }
    }
    return json({ status: "pending", purchaseId: purchase.id });
  } catch (e) {
    console.error("create-card-payment error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido." }, 500);
  }
});
