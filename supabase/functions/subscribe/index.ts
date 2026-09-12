import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseSubscribeInput } from "../_shared/subscribeInput.ts";
import { runSubscribe, type SubscribeDeps } from "../_shared/subscribeFlow.ts";
import { maskPayer } from "../_shared/mpCardPayment.ts";

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
  invalid_plan: "Plano inválido.",
  invalid_card: "Dados do cartão inválidos. Tente de novo.",
  installments_not_allowed: "Parcelamento não disponível.",
};

const FLOW_ERRORS: Record<string, string> = {
  invalid_plan: "Plano inválido.",
  exempt_user: "Sua conta tem cortesia: não há o que assinar.",
  already_subscribed: "Você já tem uma assinatura ativa.",
  profile_not_found: "Perfil não encontrado.",
};

// A pending subscription older than this is a dead attempt and must not block a
// fresh one.
const PENDING_GRACE_MINUTES = 15;

// Subscribe a LOGGED-IN user to a monthly plan with the card the Brick
// tokenized. The whole decision lives in runSubscribe (unit-tested); this file
// only wires Supabase and Mercado Pago into it.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado." }, 401);

    const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mpAccessToken   = Deno.env.get("ACCESS_TOKEN_MP_PROD")!;
    const appUrl          = Deno.env.get("APP_URL") ?? "http://localhost:8080";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user || !user.email) return json({ error: "Não autorizado." }, 401);

    const parsed = parseSubscribeInput(await req.json());
    if (!parsed.ok) return json({ error: INPUT_ERRORS[parsed.error] }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const mpHeaders = { Authorization: `Bearer ${mpAccessToken}`, "Content-Type": "application/json" };

    const deps: SubscribeDeps = {
      loadPlan: async (slug) => {
        const { data } = await admin.from("plans").select("*").eq("slug", slug).maybeSingle();
        return data;
      },
      loadProfile: async (userId) => {
        const { data } = await admin.from("profiles").select("access_kind, is_super_admin").eq("id", userId).maybeSingle();
        return data;
      },
      findLiveSubscription: async (userId) => {
        const { data } = await admin
          .from("subscriptions")
          .select("id, status")
          .eq("user_id", userId)
          .in("status", ["authorized", "past_due", "paused"])
          .maybeSingle();
        return data;
      },
      expireStalePending: async (userId) => {
        const cutoff = new Date(Date.now() - PENDING_GRACE_MINUTES * 60 * 1000).toISOString();
        await admin
          .from("subscriptions")
          .update({ status: "rejected", status_detail: "abandoned" })
          .eq("user_id", userId)
          .eq("status", "pending")
          .lt("created_at", cutoff);
      },
      insertSubscription: async (row) => {
        const { data, error } = await admin
          .from("subscriptions")
          .insert({
            user_id: row.userId,
            plan_id: row.planId,
            payer_email: row.payerEmail,
            status: "pending",
            attribution: row.attribution ?? null,
          })
          .select("id")
          .single();
        if (error || !data) throw new Error(`insert subscriptions failed: ${error?.message ?? "no row"}`);
        return data.id as string;
      },
      postPreapproval: async (body, idempotencyKey) => {
        const resp = await fetch("https://api.mercadopago.com/preapproval", {
          method: "POST",
          headers: { ...mpHeaders, "X-Idempotency-Key": idempotencyKey },
          body: JSON.stringify(body),
        });
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) console.error("subscribe: MP preapproval error", resp.status, maskPayer(payload));
        return { ok: resp.ok, status: resp.status, json: payload };
      },
      searchPreapprovalByRef: async (subscriptionId) => {
        const resp = await fetch(
          `https://api.mercadopago.com/preapproval/search?external_reference=${encodeURIComponent(subscriptionId)}`,
          { headers: mpHeaders },
        );
        if (!resp.ok) return null;
        const payload = await resp.json().catch(() => ({}));
        const first = Array.isArray(payload?.results) ? payload.results[0] : null;
        return first ?? null;
      },
      activate: async (input) => {
        const { data, error } = await admin.rpc("activate_subscription", {
          p_subscription_id: input.subscriptionId,
          p_mp_preapproval_id: input.preapprovalId,
          p_mp_status: input.mpStatus,
          p_next_payment_date: input.nextPaymentDate,
          p_card_brand: input.cardBrand,
          p_card_last_four: input.cardLastFour,
        });
        if (error) throw new Error(`activate_subscription failed: ${error.message}`);
        return data;
      },
      markPending: async ({ subscriptionId, preapprovalId, mpStatus }) => {
        await admin
          .from("subscriptions")
          .update({ mp_preapproval_id: preapprovalId, mp_status: mpStatus })
          .eq("id", subscriptionId);
      },
      reject: async ({ subscriptionId, detail }) => {
        await admin
          .from("subscriptions")
          .update({ status: "rejected", status_detail: detail })
          .eq("id", subscriptionId)
          .eq("status", "pending");
      },
      log: (message, ...args) => console.warn(message, ...args),
    };

    const result = await runSubscribe(
      {
        userId: user.id,
        email: user.email,
        planSlug: parsed.planSlug,
        card: parsed.card,
        cardLastFour: parsed.cardLastFour,
        backUrl: `${appUrl}/creditos`,
        attribution: parsed.attribution,
      },
      deps,
    );

    if (!result.ok) return json({ error: FLOW_ERRORS[result.error], code: result.error }, result.httpStatus);

    if (result.status === "rejected") {
      return json({
        status: "rejected",
        subscriptionId: result.subscriptionId,
        statusDetail: result.detail,
        message: "O cartão não foi aceito para a assinatura. Tente outro cartão.",
      });
    }
    return json({ status: result.status, subscriptionId: result.subscriptionId });
  } catch (e) {
    console.error("subscribe error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido." }, 500);
  }
});
