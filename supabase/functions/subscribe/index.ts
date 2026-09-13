import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseSubscribeInput } from "../_shared/subscribeInput.ts";
import type { SubscribeDeps } from "../_shared/subscribeFlow.ts";
import { maskPayer } from "../_shared/mpCardPayment.ts";
import { clientIp, hashIdentifier } from "../_shared/checkoutGuard.ts";
import { parseAccountInput, runAnonymousCheckout, type CheckoutDeps } from "../_shared/accountProvision.ts";
import { readAnalyticsConfig, sendAnalyticsEvents, type AttributionLike } from "../_shared/analyticsEvents.ts";

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
  invalid_account: "Informe seu nome completo.",
  invalid_email: "Informe um e-mail válido.",
  terms_required: "É preciso aceitar os Termos de Uso para assinar.",
};

const FLOW_ERRORS: Record<string, string> = {
  invalid_plan: "Plano inválido.",
  exempt_user: "Sua conta tem cortesia: não há o que assinar.",
  already_subscribed: "Você já tem uma assinatura ativa.",
  attempt_in_progress: "Já existe uma tentativa em andamento. Aguarde alguns minutos antes de tentar de novo.",
  profile_not_found: "Perfil não encontrado.",
  account_required: "Informe nome e e-mail para criar sua conta.",
  rate_limited: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  circuit_open: "O checkout está temporariamente indisponível. Tente de novo em alguns minutos.",
  email_exists: "Este e-mail já tem conta. Entre para assinar.",
};

// A pending subscription older than this is a dead attempt and must not block a
// fresh one.
const PENDING_GRACE_MINUTES = 15;

// Subscribe to a monthly plan with the card the Brick tokenized. Public
// endpoint (verify_jwt = false): with a valid user JWT it is the logged-in
// flow; without one the account is created from the payment (decision 12) and
// a session is handed back only when the card was accepted. Decisions live in
// runAnonymousCheckout / runSubscribe (unit-tested); this file wires Supabase
// and Mercado Pago into them.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mpAccessToken   = Deno.env.get("ACCESS_TOKEN_MP_PROD")!;
    const appUrl          = Deno.env.get("APP_URL") ?? "http://localhost:8080";
    // Hashes of e-mail/IP in checkout_attempts; the service key is the fallback
    // so the guard works before the dedicated secret exists.
    const hashSecret      = Deno.env.get("CHECKOUT_HASH_SECRET") ?? serviceKey;

    // The publishable key travels in Authorization too; only a real user JWT
    // selects the logged-in flow, anything else is anonymous (never 401).
    let user: { id: string; email: string } | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data, error } = await userClient.auth.getUser();
      if (!error && data.user?.email) user = { id: data.user.id, email: data.user.email };
    }

    const body = await req.json();
    const parsed = parseSubscribeInput(body);
    if (!parsed.ok) return json({ error: INPUT_ERRORS[parsed.error] }, 400);

    let account = null;
    if (!user) {
      const parsedAccount = parseAccountInput((body as Record<string, unknown>)?.account);
      if (!parsedAccount.ok) return json({ error: INPUT_ERRORS[parsedAccount.error], code: parsedAccount.error }, 400);
      account = parsedAccount.account;
    }

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
        const { data, error } = await admin
          .from("subscriptions")
          .select("id, status")
          .eq("user_id", userId)
          .in("status", ["authorized", "past_due", "paused", "pending"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        // A read failure must never look like "no subscription": that would
        // open a second live preapproval for the same card.
        if (error) throw new Error(`subscriptions lookup failed: ${error.message}`);
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
      cancelPreapproval: async (preapprovalId) => {
        const resp = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(preapprovalId)}`, {
          method: "PUT",
          headers: mpHeaders,
          body: JSON.stringify({ status: "cancelled" }),
        });
        if (!resp.ok) throw new Error(`preapproval cancel failed: ${resp.status}`);
      },
      markPending: async ({ subscriptionId, preapprovalId, mpStatus }) => {
        const { error } = await admin
          .from("subscriptions")
          .update({ mp_preapproval_id: preapprovalId, mp_status: mpStatus })
          .eq("id", subscriptionId);
        if (error) throw new Error(`subscriptions markPending failed: ${error.message}`);
      },
      reject: async ({ subscriptionId, detail }) => {
        const { error } = await admin
          .from("subscriptions")
          .update({ status: "rejected", status_detail: detail })
          .eq("id", subscriptionId)
          .eq("status", "pending");
        // The 15-minute grace closes a row left pending; log so it is visible.
        if (error) console.error("subscribe: reject update failed", subscriptionId, error.message);
      },
      log: (message, ...args) => console.warn(message, ...args),
    };

    const checkoutDeps: CheckoutDeps = {
      subscribeDeps: deps,
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
      createUser: async ({ email, fullName }) => {
        const password = crypto.randomUUID() + crypto.randomUUID();
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, must_set_password: true },
        });
        if (error) {
          const code = (error as { code?: string }).code ?? "";
          if (code === "email_exists" || error.status === 422 || /already/i.test(error.message)) return "exists";
          throw new Error(`createUser failed: ${error.message}`);
        }
        // The profile row is born by handle_new_user; flag the forced password step.
        const { error: flagError } = await admin
          .from("profiles")
          .update({ must_set_password: true, full_name: fullName })
          .eq("id", data.user.id);
        if (flagError) console.error("subscribe: must_set_password flag failed", data.user.id, flagError.message);
        return { id: data.user.id };
      },
      recordProfileFacts: async ({ userId, cpf, termsVersion }) => {
        const patch: Record<string, unknown> = {};
        if (termsVersion) {
          patch.terms_version = termsVersion;
          patch.terms_accepted_at = new Date().toISOString();
        }
        if (Object.keys(patch).length > 0) {
          const { error } = await admin.from("profiles").update(patch).eq("id", userId);
          if (error) console.error("subscribe: terms update failed", userId, error.message);
        }
        if (cpf) {
          // Only when still NULL: the CPF is never overwritten by a later card.
          const { error } = await admin.from("profiles").update({ cpf }).eq("id", userId).is("cpf", null);
          if (error) console.error("subscribe: cpf update failed", userId, error.message);
        }
      },
      generateSessionToken: async (email) => {
        const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
        if (error || !data?.properties?.hashed_token) {
          console.error("subscribe: generateLink failed", error?.message);
          return null;
        }
        return data.properties.hashed_token;
      },
      log: (message, ...args) => console.warn(message, ...args),
    };

    const outcome = await runAnonymousCheckout(
      {
        user,
        account,
        planSlug: parsed.planSlug,
        card: parsed.card,
        cardLastFour: parsed.cardLastFour,
        backUrl: `${appUrl}/creditos`,
        attribution: parsed.attribution,
        clientIp: clientIp(req.headers),
      },
      checkoutDeps,
    );

    if (!outcome.ok) return json({ error: FLOW_ERRORS[outcome.error], code: outcome.error }, outcome.httpStatus);

    const { result, accountCreated, sessionTokenHash } = outcome;

    if (result.status !== "rejected") {
      // Server-side conversion (GA4 MP / Meta CAPI); no-op without secrets.
      const { data: planRow } = await admin.from("plans").select("price_brl").eq("slug", parsed.planSlug).maybeSingle();
      await sendAnalyticsEvents(
        [{
          name: "subscription_started",
          eventId: result.subscriptionId,
          userId: outcome.userId,
          valueBrl: planRow ? Number(planRow.price_brl) : null,
          email: user?.email ?? account?.email ?? null,
          attribution: (parsed.attribution ?? null) as AttributionLike | null,
          params: { plan: parsed.planSlug, status: result.status, account_created: accountCreated },
        }],
        readAnalyticsConfig(Deno.env),
      );
    }

    if (result.status === "rejected") {
      return json({
        status: "rejected",
        subscriptionId: result.subscriptionId,
        statusDetail: result.detail,
        accountCreated,
        message: "O cartão não foi aceito para a assinatura. Tente outro cartão.",
      });
    }
    return json({
      status: result.status,
      subscriptionId: result.subscriptionId,
      accountCreated,
      // Consumed once by verifyOtp on the client; never stored.
      ...(sessionTokenHash ? { sessionTokenHash } : {}),
    });
  } catch (e) {
    console.error("subscribe error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido." }, 500);
  }
});
