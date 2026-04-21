import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_PACKAGES: Array<{ credits: number; amountBrl: number }> = [
  { credits: 30,  amountBrl: 9.90  },
  { credits: 120, amountBrl: 29.90 },
  { credits: 300, amountBrl: 59.90 },
];

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

    const supabaseUrl      = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey  = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mpAccessToken    = Deno.env.get("MP_ACCESS_TOKEN")!;
    const appUrl           = Deno.env.get("APP_URL") ?? "http://localhost:8080";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return json({ error: "Não autorizado." }, 401);
    }

    const body = await req.json();
    const { credits, amountBrl } = body as { credits?: number; amountBrl?: number };

    const pkg = ALLOWED_PACKAGES.find(
      (p) => p.credits === credits && Math.abs(p.amountBrl - (amountBrl ?? 0)) < 0.01
    );
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
      })
      .select("id")
      .single();

    if (insertError || !purchase) {
      console.error("insert credit_purchases:", insertError);
      return json({ error: "Erro ao criar registro de compra." }, 500);
    }

    // Create Mercado Pago preference
    const notificationUrl = `${supabaseUrl}/functions/v1/mp-webhook`;

    const mpPayload = {
      items: [
        {
          title:      `${pkg.credits} créditos — Olhar Singular`,
          quantity:   1,
          unit_price: pkg.amountBrl,
          currency_id: "BRL",
        },
      ],
      payer: { email: user.email },
      back_urls: {
        success: `${appUrl}/creditos/sucesso`,
        failure: `${appUrl}/creditos`,
        pending: `${appUrl}/creditos`,
      },
      auto_return:        "approved",
      external_reference: purchase.id,
      notification_url:   notificationUrl,
      payment_methods: {
        installments: 1,
      },
    };

    const mpResp = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${mpAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mpPayload),
    });

    if (!mpResp.ok) {
      const errText = await mpResp.text();
      console.error("MP preferences error:", mpResp.status, errText);
      return json({ error: "Erro ao criar preferência de pagamento." }, 502);
    }

    const preference = await mpResp.json();
    const url: string = preference.init_point;

    return json({ url });
  } catch (e) {
    console.error("create-checkout error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido." }, 500);
  }
});
