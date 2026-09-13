import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeSuperAdmin } from "../_shared/adminAuth.ts";
import { parseCancelInput } from "../_shared/subscribeInput.ts";
import { runCancelSubscription } from "../_shared/subscriptionActions.ts";
import { buildSubscriptionActionDeps } from "../_shared/subscriptionActionDeps.ts";
import { logAdminAction } from "../_shared/adminAudit.ts";
import { readAnalyticsConfig, sendAnalyticsEvents } from "../_shared/analyticsEvents.ts";

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

const ERRORS: Record<string, string> = {
  no_subscription: "Você não tem uma assinatura ativa.",
  provider_error: "Não foi possível cancelar agora. Tente de novo em alguns minutos.",
};

// Self-service cancel (decision 20): MP stops charging, the credits of the
// paid period stay until plan_period_end. A super-admin may cancel on behalf
// of a user by sending { userId }.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado." }, 401);

    const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mpAccessToken   = Deno.env.get("ACCESS_TOKEN_MP_PROD")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Não autorizado." }, 401);

    const body = await req.text();
    const parsed = parseCancelInput(body ? JSON.parse(body) : null);
    if (!parsed.ok) return json({ error: "Requisição inválida." }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    let targetUserId = user.id;
    let onBehalf = false;
    if (parsed.userId && parsed.userId !== user.id) {
      const auth = await authorizeSuperAdmin(admin, authHeader);
      if (!auth.ok) return json({ error: "Não autorizado." }, auth.status);
      targetUserId = parsed.userId;
      onBehalf = true;
    }

    const result = await runCancelSubscription({ userId: targetUserId }, buildSubscriptionActionDeps(admin, mpAccessToken));
    if (!result.ok) return json({ error: ERRORS[result.error], code: result.error }, result.httpStatus);

    await sendAnalyticsEvents(
      [{ name: "subscription_cancelled", eventId: `${result.subscriptionId}:cancel`, userId: targetUserId, valueBrl: null, params: { by_admin: onBehalf } }],
      readAnalyticsConfig(Deno.env),
    );

    if (onBehalf) {
      await logAdminAction(admin, {
        actorId: user.id,
        targetUserId,
        action: "cancel_subscription",
        payload: { subscriptionId: result.subscriptionId },
      });
    }

    return json({ status: "cancelled", subscriptionId: result.subscriptionId });
  } catch (e) {
    console.error("cancel-subscription error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido." }, 500);
  }
});
