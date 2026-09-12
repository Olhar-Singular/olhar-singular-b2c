import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseUpdateCardInput } from "../_shared/subscribeInput.ts";
import { runUpdateSubscriptionCard } from "../_shared/subscriptionActions.ts";
import { buildSubscriptionActionDeps } from "../_shared/subscriptionActionDeps.ts";

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
  invalid_card: "Dados do cartão inválidos. Tente de novo.",
  installments_not_allowed: "Parcelamento não disponível.",
};

const ERRORS: Record<string, string> = {
  no_subscription: "Você não tem uma assinatura ativa.",
  provider_error: "O cartão não foi aceito. Tente outro cartão.",
};

// Change the card of the live subscription (decision 21: the only in-place
// change; a plan change is cancel + subscribe again). The Brick tokenizes the
// new card; MP charges the next renewal on it.
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

    const parsed = parseUpdateCardInput(await req.json());
    if (!parsed.ok) return json({ error: INPUT_ERRORS[parsed.error] }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const result = await runUpdateSubscriptionCard(
      { userId: user.id, cardToken: parsed.card.token, cardLastFour: parsed.cardLastFour },
      buildSubscriptionActionDeps(admin, mpAccessToken),
    );
    if (!result.ok) return json({ error: ERRORS[result.error], code: result.error }, result.httpStatus);

    return json({ status: "updated", subscriptionId: result.subscriptionId });
  } catch (e) {
    console.error("update-subscription-card error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido." }, 500);
  }
});
