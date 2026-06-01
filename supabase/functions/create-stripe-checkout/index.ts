import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { findPackage } from "../_shared/creditPackages.ts";

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
    const stripeKey       = Deno.env.get("STRIPE_SECRET_KEY")!;
    const appUrl          = Deno.env.get("APP_URL") ?? "http://localhost:8080";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return json({ error: "Não autorizado." }, 401);
    }

    const body = await req.json();
    const { credits, amountBrl } = body as { credits?: number; amountBrl?: number };

    const pkg = findPackage(credits, amountBrl);
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
        provider:        "stripe",
      })
      .select("id")
      .single();

    if (insertError || !purchase) {
      console.error("insert credit_purchases:", insertError);
      return json({ error: "Erro ao criar registro de compra." }, 500);
    }

    // Create Stripe Checkout Session (hosted, card-only, BRL)
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency:     "brl",
            product_data: { name: `${pkg.credits} créditos — Olhar Singular` },
            unit_amount:  Math.round(pkg.amountBrl * 100),
          },
          quantity: 1,
        },
      ],
      client_reference_id: purchase.id,
      customer_email:      user.email,
      success_url:         `${appUrl}/creditos/sucesso`,
      cancel_url:          `${appUrl}/creditos`,
      metadata: {
        purchase_id: purchase.id,
        user_id:     user.id,
        credits:     String(pkg.credits),
      },
    });

    if (!session.url) {
      console.error("Stripe session has no url:", session.id);
      return json({ error: "Erro ao criar sessão de pagamento." }, 502);
    }

    return json({ url: session.url });
  } catch (e) {
    console.error("create-stripe-checkout error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido." }, 500);
  }
});
