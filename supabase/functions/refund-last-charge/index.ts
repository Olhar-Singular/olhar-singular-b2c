import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runRefundLastCharge } from "../_shared/refundFlow.ts";
import { buildRefundDeps } from "../_shared/refundDeps.ts";
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

const ERRORS: Record<string, string> = {
  nothing_to_refund: "Não há cobrança para estornar.",
  provider_error: "Não foi possível estornar agora. Tente de novo em alguns minutos.",
};

const PERMANENT_REFUSAL_MESSAGE = "O Mercado Pago recusou o estorno desta cobrança. Fale com o suporte pelo menu da conta.";

// Self-service refund of the last charge (round 2 of the card trial fix
// wave): the user asks for their money back, we refund at Mercado Pago
// first, then record it once (confirm_refund) and drop the plan credits of
// that charge. No admin on-behalf-of here — this is always the caller's own
// subscription, so no admin_actions log either.
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

    const admin = createClient(supabaseUrl, serviceKey);

    const result = await runRefundLastCharge({ userId: user.id }, buildRefundDeps(admin, mpAccessToken));
    if (!result.ok) {
      // A permanent refusal (4xx) at MP will never succeed on retry: say so plainly
      // instead of the generic "try again in a few minutes" of a transient failure.
      if (result.error === "provider_error" && result.permanent) {
        return json({ error: PERMANENT_REFUSAL_MESSAGE, code: "provider_error" }, 422);
      }
      return json({ error: ERRORS[result.error], code: result.error }, result.httpStatus);
    }

    await dispatchAnalytics(sendAnalyticsEvents(
      [{ name: "refund", eventId: `${result.invoiceId}:refund`, userId: user.id, valueBrl: result.amountBrl, params: { subscription_id: result.subscriptionId } }],
      readAnalyticsConfig(Deno.env),
    ));

    return json({ amountBrl: result.amountBrl, refundedAt: result.refundedAt, subscriptionId: result.subscriptionId });
  } catch (e) {
    console.error("refund-last-charge error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido." }, 500);
  }
});
