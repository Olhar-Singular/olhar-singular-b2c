import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { parseAccountInput, type AccountInput } from "../_shared/accountProvision.ts";
import { clientIp, hashIdentifier } from "../_shared/checkoutGuard.ts";
import { mpRequest } from "../_shared/mpHttp.ts";
import { runPixPlanCheckout, type PixPlanCheckoutDeps } from "../_shared/pixPlanCheckout.ts";
import { errorResponse } from "../_shared/publicError.ts";

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
  invalid_account: "Informe seu nome completo.",
  invalid_email: "Informe um e-mail válido.",
  terms_required: "É preciso aceitar os Termos de Uso para pagar.",
};

const FLOW_ERRORS: Record<string, string> = {
  account_required: "Informe nome e e-mail para criar sua conta.",
  invalid_plan: "Plano inválido.",
  profile_not_found: "Perfil não encontrado.",
  exempt_user: "Sua conta tem cortesia: não há o que pagar.",
  already_subscribed: "Você já tem uma assinatura no cartão.",
  email_exists: "Este e-mail já tem conta. Entre para pagar.",
  rate_limited: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  circuit_open: "O checkout está temporariamente indisponível. Tente de novo em alguns minutos.",
  provider_error: "Erro ao gerar o Pix. Tente novamente.",
};

// Pix QR of a prepaid plan (spec 2026-11-15-checkout-pix-a-vista). Public
// endpoint (verify_jwt = false): a real user JWT selects the logged-in flow,
// anything else needs the account fields. Generating the QR opens no account
// (R4): mp-webhook does that when MP confirms the payment. Decisions live in
// runPixPlanCheckout (unit-tested); this file only wires Supabase and MP.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mpAccessToken   = Deno.env.get("ACCESS_TOKEN_MP_PROD")!;
    const hashSecret      = Deno.env.get("CHECKOUT_HASH_SECRET") ?? serviceKey;

    let user: { id: string; email: string } | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data, error } = await userClient.auth.getUser();
      if (!error && data.user?.email) user = { id: data.user.id, email: data.user.email };
    }

    const body = await req.json().catch(() => null);
    if (typeof body !== "object" || body === null) return json({ error: INPUT_ERRORS.invalid_body }, 400);

    let account: AccountInput | null = null;
    if (!user) {
      const parsed = parseAccountInput((body as Record<string, unknown>).account);
      if (!parsed.ok) return json({ error: INPUT_ERRORS[parsed.error], code: parsed.error }, 400);
      account = parsed.account;
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const deps: PixPlanCheckoutDeps = {
      hash: (value) => hashIdentifier(value, hashSecret),
      recordAttempt: async (ipHash, emailHash, outcome) => {
        const { data, error } = await admin.rpc("record_checkout_attempt", {
          p_ip_hash: ipHash,
          p_email_hash: emailHash,
          p_outcome: outcome,
        });
        if (error) throw new Error(`record_checkout_attempt failed: ${error.message}`);
        return data as { by_email_1h: number; by_ip_1h: number; rejected_10m: number };
      },
      loadPlan: async (slug) => {
        const { data, error } = await admin
          .from("prepaid_plans")
          .select("id, slug, months, credits, price_brl, active, admin_only")
          .eq("slug", slug)
          .maybeSingle();
        if (error) throw new Error(`prepaid_plans lookup failed: ${error.message}`);
        return data;
      },
      loadProfile: async (userId) => {
        const { data } = await admin.from("profiles").select("access_kind, is_super_admin").eq("id", userId).maybeSingle();
        return data;
      },
      hasLiveSubscription: async (userId) => {
        const { data, error } = await admin
          .from("subscriptions")
          .select("id")
          .eq("user_id", userId)
          .in("status", ["authorized", "past_due", "paused"])
          .limit(1)
          .maybeSingle();
        // A read failure must not look like "no subscription" (R6).
        if (error) throw new Error(`subscriptions lookup failed: ${error.message}`);
        return !!data;
      },
      userIdByEmail: async (email) => {
        const { data, error } = await admin.rpc("user_id_by_email", { p_email: email });
        if (error) throw new Error(`user_id_by_email failed: ${error.message}`);
        return (data as string | null) ?? null;
      },
      insertPurchase: async (row) => {
        const { data, error } = await admin.from("credit_purchases").insert(row).select("id").single();
        if (error || !data) throw new Error(`credit_purchases insert failed: ${error?.message}`);
        return data;
      },
      createPixPayment: async (paymentBody, idempotencyKey) =>
        mpRequest("/v1/payments", { method: "POST", token: mpAccessToken, idempotencyKey, body: paymentBody }),
      storePaymentId: async (purchaseId, paymentId) => {
        const { error } = await admin.from("credit_purchases").update({ payment_id: paymentId }).eq("id", purchaseId);
        if (error) throw new Error(error.message);
      },
      cancelPurchase: async (purchaseId) => {
        const { error } = await admin
          .from("credit_purchases")
          .update({ status: "cancelled" })
          .eq("id", purchaseId)
          .eq("status", "pending");
        if (error) console.error("pix-plan-checkout: could not close the failed purchase", purchaseId, error.message);
      },
      log: (message, ...args) => console.warn(message, ...args),
    };

    const result = await runPixPlanCheckout(
      {
        user,
        account,
        planSlug: (body as Record<string, unknown>).planSlug,
        clientIp: clientIp(req.headers),
        notificationUrl: `${supabaseUrl}/functions/v1/mp-webhook`,
      },
      deps,
    );

    if (!result.ok) return json({ error: FLOW_ERRORS[result.error], code: result.error }, result.httpStatus);

    const { ok: _ok, ...payload } = result;
    return json(payload);
  } catch (e) {
    return errorResponse(e, { label: "pix-plan-checkout error:", headers: corsHeaders });
  }
});
