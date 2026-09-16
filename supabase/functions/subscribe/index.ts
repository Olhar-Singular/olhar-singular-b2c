import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseSubscribeInput } from "../_shared/subscribeInput.ts";
import type { SubscribeDeps } from "../_shared/subscribeFlow.ts";
import { maskPayer } from "../_shared/mpCardPayment.ts";
import { cancelPreapprovalAtMp, mpRequest } from "../_shared/mpHttp.ts";
import { clientIp, hashIdentifier } from "../_shared/checkoutGuard.ts";
import { parseAccountInput, runAnonymousCheckout, type CheckoutDeps } from "../_shared/accountProvision.ts";
import { dispatchAnalytics, readAnalyticsConfig, sendAnalyticsEvents, type AttributionLike } from "../_shared/analyticsEvents.ts";

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
  trial_requires_new_account: "Você já tem conta: o teste é só para contas novas. Assine um plano em Créditos.",
  cpf_required: "Informe um CPF válido para começar o teste.",
  trial_used: "Este CPF já usou o teste. Você pode assinar um plano com o mesmo cartão.",
};

// A pending subscription older than this is a dead attempt and must not block a
// fresh one.
const PENDING_GRACE_MINUTES = 15;

// Subscribe to a monthly plan with the card the Brick tokenized. Public
// endpoint (verify_jwt = false): with a valid user JWT it is the logged-in
// flow; without one the account is created from the payment (decision 12) and
// the buyer enters through the login link sent to the e-mail. With `trial:
// true` in the anonymous flow the cheapest public plan starts free for 7 days.
// Decisions live in runAnonymousCheckout / runSubscribe (unit-tested); this
// file wires Supabase and Mercado Pago into them.
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
    if (!Deno.env.get("CHECKOUT_HASH_SECRET")) console.warn("subscribe: CHECKOUT_HASH_SECRET not set, hashing with the service key (set it: runbook step 2)");

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

    const deps: SubscribeDeps = {
      loadPlan: async (slug) => {
        const { data } = await admin.from("plans").select("*").eq("slug", slug).maybeSingle();
        return data;
      },
      loadCheapestPublicPlan: async () => {
        const { data, error } = await admin
          .from("plans")
          .select("*")
          .eq("active", true)
          .eq("admin_only", false)
          .order("price_brl", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(`plans lookup failed: ${error.message}`);
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
        // An abandoned attempt that already has a preapproval at MP must be
        // cancelled there too (best effort): otherwise MP could still authorize
        // and charge it later, with the row closed here.
        const { data: stale } = await admin
          .from("subscriptions")
          .select("id, mp_preapproval_id")
          .eq("user_id", userId)
          .eq("status", "pending")
          .lt("created_at", cutoff);
        for (const row of stale ?? []) {
          if (row.mp_preapproval_id && !(await cancelPreapprovalAtMp(row.mp_preapproval_id, mpAccessToken))) {
            console.error("subscribe: ALERT abandoned preapproval not cancelled at MP", row.id, row.mp_preapproval_id);
          }
        }
        const { error } = await admin
          .from("subscriptions")
          .update({ status: "rejected", status_detail: "abandoned" })
          .eq("user_id", userId)
          .eq("status", "pending")
          .lt("created_at", cutoff);
        if (error) throw new Error(`expire stale pending failed: ${error.message}`);
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
            trial_ends_at: row.trialEndsAt,
          })
          .select("id")
          .single();
        if (error || !data) throw new Error(`insert subscriptions failed: ${error?.message ?? "no row"}`);
        return data.id as string;
      },
      postPreapproval: async (body, idempotencyKey) => {
        const resp = await mpRequest("/preapproval", { method: "POST", token: mpAccessToken, body, idempotencyKey });
        if (!resp.ok) console.error("subscribe: MP preapproval error", resp.status, maskPayer(resp.json));
        return resp;
      },
      searchPreapprovalByRef: async (subscriptionId) => {
        const resp = await mpRequest(
          `/preapproval/search?external_reference=${encodeURIComponent(subscriptionId)}`,
          { token: mpAccessToken },
        );
        if (!resp.ok) return null;
        const results = resp.json.results;
        const first = Array.isArray(results) ? results[0] : null;
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
        if (!(await cancelPreapprovalAtMp(preapprovalId, mpAccessToken))) throw new Error("preapproval cancel failed");
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
      trialUsedByCpf: async (cpf) => {
        const { data, error } = await admin.rpc("trial_used_by_cpf", { p_cpf: cpf });
        if (error) throw new Error(`trial_used_by_cpf failed: ${error.message}`);
        return data === true;
      },
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
        // The profile row is born by handle_new_user; flag the forced password
        // step. One retry, then fail loudly BEFORE any charge: an account with a
        // random password and no flag would be let in without setting one (the
        // client still falls back to the metadata stamped above).
        const flag = () => admin.from("profiles").update({ must_set_password: true, full_name: fullName }).eq("id", data.user.id);
        let { error: flagError } = await flag();
        if (flagError) ({ error: flagError } = await flag());
        if (flagError) throw new Error(`must_set_password flag failed: ${flagError.message}`);
        return { id: data.user.id };
      },
      recordProfileFacts: async ({ userId, cpf, termsVersion }) => {
        // Money already moved: these writes get one retry and an ALERT log
        // (grep target for support), never a failure back to the payer.
        const retrying = async (label: string, run: () => PromiseLike<{ error: { message: string } | null }>) => {
          let { error } = await run();
          if (error) ({ error } = await run());
          if (error) console.error(`subscribe: ALERT ${label} not recorded after payment`, userId, error.message);
        };
        if (termsVersion) {
          const patch = { terms_version: termsVersion, terms_accepted_at: new Date().toISOString() };
          await retrying("terms acceptance", () => admin.from("profiles").update(patch).eq("id", userId));
        }
        if (cpf) {
          // Only when still NULL: the CPF is never overwritten by a later card.
          await retrying("cpf", () => admin.from("profiles").update({ cpf }).eq("id", userId).is("cpf", null));
        }
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
        trial: parsed.trial,
      },
      checkoutDeps,
    );

    if (!outcome.ok) return json({ error: FLOW_ERRORS[outcome.error], code: outcome.error }, outcome.httpStatus);

    const { result, accountCreated } = outcome;

    if (result.status !== "rejected") {
      // Server-side conversion (GA4 MP / Meta CAPI); no-op without secrets.
      const trial = !!result.trialEndsAt;
      await dispatchAnalytics(sendAnalyticsEvents(
        [{
          name: trial ? "trial_started" : "subscription_started",
          eventId: result.subscriptionId,
          userId: outcome.userId,
          valueBrl: trial ? 0 : result.priceBrl,
          email: user?.email ?? account?.email ?? null,
          attribution: (parsed.attribution ?? null) as AttributionLike | null,
          params: {
            plan: result.planSlug,
            status: result.status,
            account_created: accountCreated,
            ...(trial ? { trial_ends_at: result.trialEndsAt as string } : {}),
          },
        }],
        readAnalyticsConfig(Deno.env),
      ));
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
    // No session in the answer: a new account logs in through the e-mail link
    // (signInWithOtp on the client), proving it owns the address.
    return json({
      status: result.status,
      subscriptionId: result.subscriptionId,
      accountCreated,
      ...(result.trialEndsAt ? { trialEndsAt: result.trialEndsAt } : {}),
    });
  } catch (e) {
    console.error("subscribe error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido." }, 500);
  }
});
